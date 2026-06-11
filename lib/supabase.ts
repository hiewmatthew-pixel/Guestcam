import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_client) {
    _client = createClient(url!, key!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return _client;
}

export type EventRow = {
  id: string;
  slug: string;
  couple_names: string;
  wedding_date: string;
  welcome_message: string | null;
  tier: string;
  manage_token: string;
  reveal_at: string | null;
  auto_approve: boolean;
  created_at: string;
};

// Columns that are safe to expose to the anon (guest) client. The
// manage_token is the couple's portal credential and MUST NOT be
// selected from the browser — the database also revokes anon SELECT on
// that column (see README), so `select('*')` from anon would error.
// Use this constant for every guest-facing events read.
export const PUBLIC_EVENT_COLUMNS =
  'id, slug, couple_names, wedding_date, welcome_message, tier, reveal_at, auto_approve, created_at';

// A public event read never carries the manage_token; we fill it with an
// empty string so the shape still satisfies EventRow for components that
// only read display fields.
export type PublicEvent = Omit<EventRow, 'manage_token'>;

export function toEventRow(pub: PublicEvent): EventRow {
  return { ...pub, manage_token: '' };
}

/**
 * Fetch a single event by slug using only guest-safe columns. Returns
 * an EventRow with an empty manage_token. Use on every public page.
 */
export async function fetchPublicEventBySlug(
  sb: SupabaseClient,
  slug: string,
): Promise<EventRow | null> {
  const { data } = await sb
    .from('events')
    .select(PUBLIC_EVENT_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  return toEventRow(data as PublicEvent);
}

export type MediaType = 'photo' | 'video' | 'boomerang' | 'voice';

export function labelForMediaType(t: MediaType): string {
  if (t === 'photo') return 'photo';
  if (t === 'boomerang') return 'boomerang';
  if (t === 'voice') return 'voice note';
  return 'film';
}

export type SubmissionRow = {
  id: string;
  event_id: string;
  media_url: string;
  media_type: MediaType;
  filter_name: string;
  guest_name: string | null;
  approved: boolean;
  created_at: string;
};

export type CommentRow = {
  id: string;
  submission_id: string;
  event_id: string;
  guest_name: string | null;
  body: string;
  created_at: string;
};
