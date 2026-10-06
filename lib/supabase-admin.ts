// Server-only Supabase client that uses the service-role key.
// NEVER import this from a client component.
// The service-role key bypasses RLS, so the server action MUST authorize
// the caller (admin cookie or manage_token check) BEFORE touching this.

import 'server-only';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * Tell open galleries / TV displays / portals for this event to reload.
 * Anon realtime can't see a row that was just hidden (RLS filters it out
 * of the change feed), so moderation pings a broadcast channel instead.
 * Best-effort: a failure here never fails the moderation action.
 */
export async function notifyModerationChange(eventId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    const ch = sb.channel(`moderation-${eventId}`);
    await ch.httpSend('changed', { at: Date.now() });
    sb.removeChannel(ch);
  } catch {
    /* ignore */
  }
}

/** Remove every stored file under an event's folder in the submissions bucket. */
export async function deleteEventMedia(eventId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const bucket = sb.storage.from('submissions');
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await bucket.list(eventId, { limit: 1000 });
    if (error || !data || data.length === 0) return;
    const { error: rmErr } = await bucket.remove(data.map((f) => `${eventId}/${f.name}`));
    if (rmErr) return;
  }
}
