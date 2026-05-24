// Local-storage backed store used when Supabase isn't configured or when
// the user toggles demo mode. Media blobs are kept as object URLs in memory
// plus a base64 copy in localStorage so they survive a refresh.

import type { EventRow, SubmissionRow } from './supabase';

const EVENTS_KEY = 'ggc:events';
const SUBS_KEY = 'ggc:subs';
const DEMO_FLAG_KEY = 'ggc:demo';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
}

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DEMO_FLAG_KEY) === '1';
}

export function setDemoMode(on: boolean) {
  if (typeof window === 'undefined') return;
  if (on) window.localStorage.setItem(DEMO_FLAG_KEY, '1');
  else window.localStorage.removeItem(DEMO_FLAG_KEY);
}

export function listEvents(): EventRow[] {
  return read<EventRow[]>(EVENTS_KEY, []);
}

export function getEventBySlug(slug: string): EventRow | null {
  return listEvents().find((e) => e.slug === slug) ?? null;
}

export function createEvent(input: {
  slug: string;
  couple_names: string;
  wedding_date: string;
  welcome_message?: string | null;
  tier?: string;
}): EventRow {
  const events = listEvents();
  if (events.some((e) => e.slug === input.slug)) {
    throw new Error('Slug already exists');
  }
  const row: EventRow = {
    id: uuid(),
    slug: input.slug,
    couple_names: input.couple_names,
    wedding_date: input.wedding_date,
    welcome_message: input.welcome_message ?? null,
    tier: input.tier ?? 'signature',
    created_at: new Date().toISOString(),
  };
  write(EVENTS_KEY, [row, ...events]);
  return row;
}

export function deleteEvent(id: string) {
  const events = listEvents().filter((e) => e.id !== id);
  write(EVENTS_KEY, events);
  const subs = listAllSubmissions().filter((s) => s.event_id !== id);
  write(SUBS_KEY, subs);
}

export function listAllSubmissions(): SubmissionRow[] {
  return read<SubmissionRow[]>(SUBS_KEY, []);
}

export function listSubmissions(eventId: string): SubmissionRow[] {
  return listAllSubmissions()
    .filter((s) => s.event_id === eventId)
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
}

export async function addSubmission(input: {
  event_id: string;
  blob: Blob;
  media_type: 'photo' | 'video';
  filter_name: string;
  guest_name?: string | null;
}): Promise<SubmissionRow> {
  // store as base64 data URL so it survives reload
  const dataUrl = await blobToDataUrl(input.blob);
  const row: SubmissionRow = {
    id: uuid(),
    event_id: input.event_id,
    media_url: dataUrl,
    media_type: input.media_type,
    filter_name: input.filter_name,
    guest_name: input.guest_name ?? null,
    approved: true,
    created_at: new Date().toISOString(),
  };
  const all = listAllSubmissions();
  write(SUBS_KEY, [row, ...all]);
  // notify same-tab listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ggc:submission', { detail: row }));
  }
  return row;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function subscribeToSubmissions(
  eventId: string,
  onChange: (rows: SubmissionRow[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange(listSubmissions(eventId));
  window.addEventListener('storage', handler);
  window.addEventListener('ggc:submission', handler as EventListener);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('ggc:submission', handler as EventListener);
  };
}
