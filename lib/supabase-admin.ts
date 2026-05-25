// Server-only Supabase client that uses the service-role key.
// NEVER import this from a client component.
// The service-role key bypasses RLS, so the server action MUST authorize
// the caller (admin cookie or manage_token check) BEFORE touching this.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(url && serviceKey);

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured) return null;
  if (!_admin) {
    _admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
