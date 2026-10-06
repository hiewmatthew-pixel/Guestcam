// Persistent send queue for guest captures.
//
// A capture is written to IndexedDB *before* any network call, so locking
// the phone, closing the tab or a long Wi-Fi dead zone never loses it. A
// worker drains the queue: ask the server for a signed upload URL, PUT the
// bytes, then ask the server to record it. Each step is safe to repeat.
// Retries back off from 5 s to 5 min and resume on reconnect / tab focus.
// Items rejected for good stay as "failed" so the guest can save them.
//
// - Only one tab sends at a time (Web Locks), so a guest who opened the QR
//   link twice never uploads the same capture twice.
// - IndexedDB is the single source of truth when available; memory is only
//   used if the browser has no IndexedDB (then the pill asks the guest to
//   keep the page open).
// - Talks to stable /api/upload/* routes, so a mid-event deploy doesn't
//   strand phones that have had the page open all night.

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
  missingChecks?: number;
  failed?: boolean;
  lastError?: string;
};

export type QueueState = {
  pending: number;
  failed: number;
  sendingId: string | null;
  progress: number | null;
  lastError: string | null;
  sentCount: number;
  persistent: boolean; // false = memory only, keep the page open
};

const DB_NAME = 'glancecam';
const STORE = 'send-queue';
const SIGNED_URL_TTL = 90 * 60 * 1000; // signed upload URLs last 2 h
const GIVE_UP_AFTER = 24 * 60 * 60 * 1000;

// ---------- storage ------------------------------------------------------

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, QueueItem>(); // only used when there's no IndexedDB

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

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

/** Returns true if the item is safely persisted on the device. */
async function putItem(item: QueueItem): Promise<boolean> {
  const db = await openDb();
  if (db) {
    try {
      await run(db, 'readwrite', (s) => s.put(item));
      memory.delete(item.id);
      return true;
    } catch {
      /* e.g. old Safari refusing Blobs: fall back to memory */
    }
  }
  memory.set(item.id, item);
  return false;
}

async function deleteItem(id: string) {
  memory.delete(id);
  const db = await openDb();
  if (db) await run(db, 'readwrite', (s) => s.delete(id)).catch(() => {});
}

async function getItem(id: string): Promise<QueueItem | null> {
  if (memory.has(id)) return memory.get(id)!;
  const db = await openDb();
  if (!db) return null;
  return ((await run(db, 'readonly', (s) => s.get(id)).catch(() => null)) as QueueItem | undefined) ?? null;
}

async function allItems(): Promise<QueueItem[]> {
  const db = await openDb();
  const stored = db ? ((await run(db, 'readonly', (s) => s.getAll()).catch(() => [])) as QueueItem[]) : [];
  return [...stored, ...memory.values()].sort((a, b) => a.createdAt - b.createdAt);
}

// ---------- state ----------------------------------------------------------

let state: QueueState = {
  pending: 0,
  failed: 0,
  sendingId: null,
  progress: null,
  lastError: null,
  sentCount: 0,
  persistent: true,
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
    persistent: memory.size === 0,
  });
}

export function subscribeQueue(fn: (s: QueueState) => void): () => void {
  listeners.add(fn);
  fn(state);
  startWorker();
  return () => listeners.delete(fn);
}

export async function firstFailedItem(): Promise<QueueItem | null> {
  return (await allItems()).find((i) => i.failed) ?? null;
}

export async function discardItem(id: string) {
  await deleteItem(id);
  await recount();
}

export async function retryFailed() {
  for (const it of await allItems()) {
    if (it.failed) {
      await putItem({ ...it, failed: false, attempts: 0, nextAt: 0, signedUrl: undefined, createdAt: Date.now() });
    }
  }
  await recount();
  kick();
}

export async function enqueueCapture(input: {
  slug: string;
  mediaType: MediaType;
  blob: Blob;
  contentType: string;
  ext: string;
  filterName: string;
  guestName: string | null;
}): Promise<{ persistent: boolean }> {
  const item: QueueItem = {
    ...input,
    contentType: input.contentType.split(';')[0].trim(),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
    attempts: 0,
    nextAt: 0,
  };
  const persistent = await putItem(item);
  await recount();
  kick();
  return { persistent };
}

// ---------- worker ---------------------------------------------------------

let running = false;
let rerun = false;
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

const backoff = (attempts: number) => Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempts, 6));

export function kick() {
  startWorker();
  if (running) {
    rerun = true; // something was queued while draining: go round again
    return;
  }
  running = true;
  rerun = false;
  withSendLock(drain).finally(() => {
    running = false;
    if (rerun) kick();
  });
}

/** One sender across all tabs; other tabs wait and re-check afterwards. */
async function withSendLock(fn: () => Promise<void>) {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks?.request) {
    await locks.request('glancecam-send', fn).catch(() => {});
  } else {
    await fn();
  }
}

async function drain() {
  for (;;) {
    const items = (await allItems()).filter((i) => !i.failed);
    await recount();
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
    // re-read: another tab may have sent or changed it
    const fresh = await getItem(due.id);
    if (!fresh || fresh.failed) continue;
    await sendOne(fresh);
  }
}

type ApiResult = { ok: true; path?: string; signedUrl?: string } | { ok: false; error: string; retry: boolean };

async function api(path: string, body: unknown): Promise<ApiResult> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status >= 500 || res.status === 429) {
    return { ok: false, error: 'Connection is weak, still trying…', retry: true };
  }
  return (await res.json()) as ApiResult;
}

async function sendOne(item: QueueItem) {
  emit({ sendingId: item.id, progress: item.uploaded ? 1 : 0 });
  const retryLater = async (message: string, patch: Partial<QueueItem> = {}) => {
    const attempts = item.attempts + 1;
    const giveUp = Date.now() - item.createdAt > GIVE_UP_AFTER;
    await putItem({
      ...item,
      ...patch,
      attempts,
      failed: giveUp || undefined,
      nextAt: Date.now() + backoff(attempts),
      lastError: message,
    });
    emit({ lastError: message });
  };
  const giveUp = async (message: string) => {
    await putItem({ ...item, failed: true, lastError: message });
    emit({ lastError: message });
  };

  try {
    // 1. a signed URL for a server-chosen, server-recorded path
    if (!item.uploaded && (!item.signedUrl || !item.signedAt || Date.now() - item.signedAt > SIGNED_URL_TTL)) {
      const res = await api('/api/upload/request', {
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
        if (!err.retriable) return giveUp(err.message);
        // an expired link: ask for a fresh one next time
        const patch = err.status === 400 || err.status === 403 ? { signedUrl: undefined } : {};
        return retryLater('Connection is weak, still trying…', patch);
      }
      item = { ...item, uploaded: true, missingChecks: 0 };
      await putItem(item);
    }

    // 3. record it
    const fin = await api('/api/upload/finalize', {
      slug: item.slug,
      path: item.path,
      filterName: item.filterName,
      guestName: item.guestName,
    });
    if (!fin.ok) {
      if (!fin.retry) return giveUp(fin.error);
      // the file never arrived after several checks: upload it again
      const missing = (item.missingChecks ?? 0) + 1;
      if (/not arrived/i.test(fin.error) && missing >= 5) {
        return retryLater(fin.error, { uploaded: false, signedUrl: undefined, path: undefined, missingChecks: 0 });
      }
      return retryLater(fin.error, { missingChecks: missing });
    }

    await deleteItem(item.id);
    emit({ sentCount: state.sentCount + 1, lastError: null, progress: null });
  } catch {
    // network down, server unreachable, …
    await retryLater('Connection is weak, still trying…');
  }
}
