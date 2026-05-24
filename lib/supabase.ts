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
  created_at: string;
};

export type SubmissionRow = {
  id: string;
  event_id: string;
  media_url: string;
  media_type: 'photo' | 'video';
  filter_name: string;
  guest_name: string | null;
  approved: boolean;
  created_at: string;
};
