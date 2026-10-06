// Per-submission comments. Stored in the new public.comments table
// when Supabase is configured, otherwise in localStorage so demo
// mode + offline development still work.

import { addCommentAction } from '@/app/event/[slug]/actions';
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
    // only comments on photos this guest can see (approved, revealed, open)
    const { data, error } = await sb.rpc('get_comments', { p_submission_id: submissionId });
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
    // server-checked + rate-limited; the anon key can't insert comments
    const res = await addCommentAction({
      eventId: input.event_id,
      submissionId: input.submission_id,
      guestName: input.guest_name,
      body,
    });
    if (!res.ok) throw new Error(res.error);
    return res.comment;
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
  // the server broadcasts each new comment (anon has no table access)
  const channel = sb
    .channel(`comments-${eventId}`)
    .on('broadcast', { event: 'comment' }, ({ payload }) => {
      const row = payload as CommentRow;
      if (row?.submission_id === submissionId) onInsert(row);
    })
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
