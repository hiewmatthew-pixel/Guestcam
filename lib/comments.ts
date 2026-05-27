// Per-submission comments. Stored in the new public.comments table
// when Supabase is configured, otherwise in localStorage so demo
// mode + offline development still work.

import { getSupabase, isSupabaseConfigured, type CommentRow } from './supabase';
import { isDemoMode } from './demo-store';

const LS_KEY_PREFIX = 'ggc:comments:';

function lsKey(eventId: string) {
  return `${LS_KEY_PREFIX}${eventId}`;
}

function lsRead(eventId: string): CommentRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(lsKey(eventId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CommentRow[]) : [];
  } catch {
    return [];
  }
}

function lsWrite(eventId: string, rows: CommentRow[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lsKey(eventId), JSON.stringify(rows));
  } catch {
    /* quota or private mode */
  }
}

function useSupabase(eventId: string): boolean {
  return isSupabaseConfigured && !isDemoMode() && eventId !== 'demo-event';
}

export async function listCommentsFor(
  eventId: string,
  submissionId: string,
): Promise<CommentRow[]> {
  if (useSupabase(eventId)) {
    const sb = getSupabase()!;
    const { data, error } = await sb
      .from('comments')
      .select('*')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CommentRow[];
  }
  return lsRead(eventId).filter((c) => c.submission_id === submissionId);
}

export async function addComment(input: {
  event_id: string;
  submission_id: string;
  guest_name: string | null;
  body: string;
}): Promise<CommentRow> {
  const body = input.body.trim().slice(0, 280);
  if (!body) throw new Error('Comment is empty.');

  if (useSupabase(input.event_id)) {
    const sb = getSupabase()!;
    const { data, error } = await sb
      .from('comments')
      .insert({
        event_id: input.event_id,
        submission_id: input.submission_id,
        guest_name: input.guest_name,
        body,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as CommentRow;
  }

  // localStorage fallback
  const row: CommentRow = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    event_id: input.event_id,
    submission_id: input.submission_id,
    guest_name: input.guest_name,
    body,
    created_at: new Date().toISOString(),
  };
  const all = lsRead(input.event_id);
  all.push(row);
  lsWrite(input.event_id, all);
  return row;
}

/**
 * Subscribe to new comments for a specific submission. Returns an
 * unsubscribe function. No-op outside Supabase mode.
 */
export function subscribeToComments(
  eventId: string,
  submissionId: string,
  onInsert: (row: CommentRow) => void,
): () => void {
  if (!useSupabase(eventId)) return () => {};
  const sb = getSupabase()!;
  const channel = sb
    .channel(`comments-${submissionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `submission_id=eq.${submissionId}`,
      },
      (payload) => onInsert(payload.new as CommentRow),
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

const NAME_LS_KEY = 'ggc:guest-name';

export function readStoredGuestName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(NAME_LS_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeGuestName(name: string) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = name.trim().slice(0, 60);
    if (trimmed) window.localStorage.setItem(NAME_LS_KEY, trimmed);
  } catch {
    /* ignore */
  }
}
