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
