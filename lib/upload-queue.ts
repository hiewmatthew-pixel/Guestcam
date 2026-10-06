// Persistent send queue for guest captures.
//
// A capture is written to IndexedDB *before* any network call, so locking
// the phone, closing the tab or a 20-minute Wi-Fi dead zone never loses
// it. A small worker drains the queue: request a signed upload URL, PUT
// the bytes, then record the submission. Each step is safe to repeat.
// Retries back off from 5 s to 5 min and resume when the browser comes
// back online or the page becomes visible again. Items that are rejected
// for good (e.g. event closed) stay in the queue as "failed" so the guest
// can still save them to their phone.

import { finalizeSubmissionAction, requestUploadAction } from '@/app/event/[slug]/actions';
import { uploadToSignedUrl, UploadError } from './upload';
import type { MediaType } from './supabase';

export type QueueItem = {
  id: string;
  slug: string;
  mediaType: MediaType;
  contentType: string;
  ext: string;
  filterName: string;
  guestName: string | null;
  blob: Blob;
  createdAt: number;
  attempts: number;
  nextAt: number;
  path?: string;
  signedUrl?: string;
  signedAt?: number;
  uploaded?: boolean;
  failed?: boolean;
  lastError?: string;
};

export type QueueState = {
  pending: number; // waiting or sending
  failed: number; // rejected for good
  sendingId: string | null;
  progress: number | null; // 0..1 for the item being uploaded
  lastError: string | null;
  sentCount: number; // sent during this page session
};

const DB_NAME = 'glancecam';
const STORE = 'send-queue';
const SIGNED_URL_TTL = 90 * 60 * 1000; // signed upload URLs last 2 h
const GIVE_UP_AFTER = 24 * 60 * 60 * 1000;

// ---------- storage (IndexedDB with an in-memory fallback) -------------

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, QueueItem>();

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putItem(item: QueueItem) {
  memory.set(item.id, item);
  await tx('readwrite', (s) => s.put(item));
}

async function deleteItem(id: string) {
  memory.delete(id);
  await tx('readwrite', (s) => s.delete(id));
}

async function allItems(): Promise<QueueItem[]> {
  const stored = (await tx<QueueItem[]>('readonly', (s) => s.getAll())) ?? [];
  for (const it of stored) if (!memory.has(it.id)) memory.set(it.id, it);
  return Array.from(memory.values()).sort((a, b) => a.createdAt - b.createdAt);
}

// ---------- state + subscribers ---------------------------------------

let state: QueueState = {
  pending: 0,
  failed: 0,
  sendingId: null,
  progress: null,
  lastError: null,
  sentCount: 0,
};
const listeners = new Set<(s: QueueState) => void>();

function emit(patch: Partial<QueueState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

async function recount() {
  const items = await allItems();
  emit({
    pending: items.filter((i) => !i.failed).length,
    failed: items.filter((i) => i.failed).length,
  });
}

export function subscribeQueue(fn: (s: QueueState) => void): () => void {
  listeners.add(fn);
  fn(state);
  startWorker();
  return () => listeners.delete(fn);
}

export async function failedItems(): Promise<QueueItem[]> {
  return (await allItems()).filter((i) => i.failed);
}

export async function discardItem(id: string) {
  await deleteItem(id);
  await recount();
}

export async function retryFailed() {
  for (const it of await allItems()) {
    if (it.failed) await putItem({ ...it, failed: false, attempts: 0, nextAt: 0, signedUrl: undefined });
  }
  await recount();
  kick();
}

// ---------- worker ------------------------------------------------------

export async function enqueueCapture(input: {
  slug: string;
  mediaType: MediaType;
  blob: Blob;
  contentType: string;
  ext: string;
  filterName: string;
  guestName: string | null;
}): Promise<void> {
  const item: QueueItem = {
    ...input,
    contentType: input.contentType.split(';')[0].trim(),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
    attempts: 0,
    nextAt: 0,
  };
  await putItem(item);
  await recount();
  kick();
}

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let workerStarted = false;

function startWorker() {
  if (workerStarted || typeof window === 'undefined') return;
  workerStarted = true;
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  recount().then(kick);
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(kick, ms);
}

function backoff(attempts: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempts, 6));
}

export function kick() {
  startWorker();
  if (running) return;
  running = true;
  drain().finally(() => {
    running = false;
  });
}

async function drain() {
  for (;;) {
    const items = (await allItems()).filter((i) => !i.failed);
    if (items.length === 0) {
      emit({ sendingId: null, progress: null });
      return;
    }
    const now = Date.now();
    const due = items.find((i) => i.nextAt <= now);
    if (!due) {
      emit({ sendingId: null, progress: null });
      schedule(Math.max(1_000, Math.min(...items.map((i) => i.nextAt)) - now));
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      emit({ sendingId: null, progress: null, lastError: 'Waiting for a connection…' });
      schedule(15_000);
      return;
    }
    await sendOne(due);
  }
}

async function sendOne(item: QueueItem) {
  emit({ sendingId: item.id, progress: item.uploaded ? 1 : 0 });
  const retryLater = async (message: string) => {
    const attempts = item.attempts + 1;
    if (Date.now() - item.createdAt > GIVE_UP_AFTER) {
      await putItem({ ...item, failed: true, lastError: message });
    } else {
      await putItem({ ...item, attempts, nextAt: Date.now() + backoff(attempts), lastError: message });
    }
    emit({ lastError: message });
    await recount();
  };
  const giveUp = async (message: string) => {
    await putItem({ ...item, failed: true, lastError: message });
    emit({ lastError: message });
    await recount();
  };

  try {
    // 1. a fresh signed URL for a server-chosen path
    if (!item.uploaded && (!item.signedUrl || !item.signedAt || Date.now() - item.signedAt > SIGNED_URL_TTL)) {
      const res = await requestUploadAction({
        slug: item.slug,
        mediaType: item.mediaType,
        contentType: item.contentType,
        size: item.blob.size,
      });
      if (!res.ok) return res.retry ? retryLater(res.error) : giveUp(res.error);
      item = { ...item, path: res.path, signedUrl: res.signedUrl, signedAt: Date.now() };
      await putItem(item);
    }

    // 2. the bytes
    if (!item.uploaded) {
      try {
        await uploadToSignedUrl({
          signedUrl: item.signedUrl!,
          blob: item.blob,
          contentType: item.contentType,
          onProgress: (p) => emit({ progress: p }),
        });
      } catch (e) {
        const err = e instanceof UploadError ? e : new UploadError(String(e), undefined, true);
        if (err.status === 400 || err.status === 403) item = { ...item, signedUrl: undefined };
        await putItem(item);
        return err.retriable ? retryLater('Connection is weak, still trying…') : giveUp(err.message);
      }
      item = { ...item, uploaded: true };
      await putItem(item);
    }

    // 3. record it
    const fin = await finalizeSubmissionAction({
      slug: item.slug,
      path: item.path!,
      mediaType: item.mediaType,
      filterName: item.filterName,
      guestName: item.guestName,
    });
    if (!fin.ok) return fin.retry ? retryLater(fin.error) : giveUp(fin.error);

    await deleteItem(item.id);
    emit({ sentCount: state.sentCount + 1, lastError: null, progress: null });
    await recount();
  } catch {
    // server action unreachable (offline, deploy in progress, …)
    await retryLater('Connection is weak, still trying…');
  }
}
