'use server';

import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';

const UPLOAD_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{10,16}-[0-9a-f-]{36}\.(jpg|webm|mp4|m4a)$/i;

/**
 * Delete an uploaded file whose submissions row failed to insert. Guests
 * can't delete with the anon key, so this runs with the service role, but
 * only for a well-formed upload path that no submission references.
 */
export async function discardOrphanUploadAction(path: string): Promise<void> {
  if (typeof path !== 'string' || !UPLOAD_PATH_RE.test(path)) return;
  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(`orphan:${ip}`, 10, 60_000).allowed) return;

  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { data, error } = await sb
    .from('submissions')
    .select('id')
    .like('media_url', `%/submissions/${path}`)
    .limit(1);
  if (error || (data && data.length > 0)) return;
  await sb.storage.from('submissions').remove([path]);
}
