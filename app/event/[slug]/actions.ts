'use server';

// Guest write path. The anon key can no longer write anything (see
// supabase/schema.sql): every capture, upload and comment goes through
// these actions, which check the event, the tier, file type/size and a
// per-IP rate limit before touching storage or the database with the
// service role. The database adds hard per-event caps on top, so even a
// flood spread across many server instances can't swamp an event.

import { headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin, isUuid } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { cleanString, LIMITS } from '@/lib/validate';
import { getTier } from '@/lib/tiers';
import { FILTERS } from '@/lib/filters';
import type { CommentRow, MediaType } from '@/lib/supabase';

const BUCKET = 'submissions';
const DAY = 24 * 60 * 60 * 1000;
// Per-IP limits are deliberately generous: a whole venue's guests often
// share ONE public Wi-Fi IP, and the first dance can produce a burst.
// These stop a single script hammering us; the hard per-event caps live
// in the database (flood-guard triggers in supabase/schema.sql).
const IP_LIMIT_PER_MIN = 300;

// what each capture kind may be uploaded as, and how big
const MEDIA_RULES: Record<MediaType, { types: Record<string, string>; maxBytes: number }> = {
  photo: { types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }, maxBytes: 15 * 1024 * 1024 },
  video: { types: { 'video/mp4': 'mp4', 'video/webm': 'webm' }, maxBytes: 30 * 1024 * 1024 },
  boomerang: { types: { 'video/mp4': 'mp4', 'video/webm': 'webm' }, maxBytes: 30 * 1024 * 1024 },
  voice: { types: { 'audio/mp4': 'm4a', 'audio/webm': 'webm' }, maxBytes: 10 * 1024 * 1024 },
};

const UPLOAD_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{10,16}-[0-9a-f-]{36}\.(jpg|png|webp|webm|mp4|m4a)$/i;

type GuestEvent = {
  id: string;
  tier: string;
  wedding_date: string;
  auto_approve: boolean;
};

function clientIp(): string {
  const h = headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

/** Base MIME type without codec parameters ("video/webm;codecs=vp9" -> "video/webm"). */
function baseType(contentType: unknown): string {
  return typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : '';
}

/**
 * Captures are accepted from two weeks before the wedding (so the couple
 * and studio can test) until the guest gallery closes. Wedding dates are
 * calendar dates; the window is padded a day each side so time zones
 * never cut a guest off on the night.
 */
function captureWindowOpen(ev: GuestEvent, now = Date.now()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ev.wedding_date);
  if (!m) return false;
  const wedding = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const closes = wedding + (getTier(ev.tier).features.galleryDays + 2) * DAY;
  return now >= wedding - 14 * DAY && now <= closes;
}

async function loadGuestEvent(slugRaw: unknown): Promise<GuestEvent | null> {
  const slug = cleanString(slugRaw, LIMITS.SLUG);
  const sb = getSupabaseAdmin();
  if (!slug || !sb) return null;
  const { data } = await sb
    .from('events')
    .select('id, tier, wedding_date, auto_approve')
    .eq('slug', slug)
    .maybeSingle();
  return (data as GuestEvent | null) ?? null;
}

function tierAllows(ev: GuestEvent, mediaType: MediaType): boolean {
  const f = getTier(ev.tier).features;
  if (mediaType === 'video') return f.allowVideo;
  if (mediaType === 'boomerang') return f.allowBoomerang;
  if (mediaType === 'voice') return f.voiceNotes;
  return true;
}

type Fail = { ok: false; error: string; retry: boolean };
const fail = (error: string, retry = false): Fail => ({ ok: false, error, retry });

/**
 * Step 1 of a guest upload: validate everything up front and hand back a
 * one-time signed upload URL for a server-chosen path. The file goes
 * straight from the phone to storage (no 30 MB bodies through Vercel).
 */
export async function requestUploadAction(input: {
  slug: string;
  mediaType: MediaType;
  contentType: string;
  size: number;
}): Promise<{ ok: true; path: string; signedUrl: string } | Fail> {
  if (!checkRateLimit(`upload-req:${clientIp()}`, IP_LIMIT_PER_MIN, 60_000).allowed) {
    return fail('Lots of uploads at once. Trying again in a moment.', true);
  }
  const rules = MEDIA_RULES[input.mediaType];
  if (!rules) return fail('That capture type is not supported.');
  const type = baseType(input.contentType);
  const ext = rules.types[type];
  if (!ext) return fail('That file type is not supported.');
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > rules.maxBytes) {
    return fail(`That file is too large (max ${Math.round(rules.maxBytes / 1024 / 1024)} MB).`);
  }

  const ev = await loadGuestEvent(input.slug);
  if (!ev) return fail('This event could not be found.');
  if (!captureWindowOpen(ev)) return fail('This event is no longer accepting captures.');
  if (!tierAllows(ev, input.mediaType)) return fail('That capture type is not available for this event.');

  const path = `${ev.id}/${Date.now()}-${randomUUID()}.${ext}`;
  const { data, error } = await getSupabaseAdmin()!.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail('Could not start the upload. Trying again shortly.', true);
  return { ok: true, path, signedUrl: data.signedUrl };
}

/**
 * Step 2: after the bytes are in storage, verify the object really exists
 * with an allowed type and size for this event, then record it. Safe to
 * retry: a path can only ever be recorded once (unique media_url).
 */
export async function finalizeSubmissionAction(input: {
  slug: string;
  path: string;
  mediaType: MediaType;
  filterName: string;
  guestName: string | null;
}): Promise<{ ok: true } | Fail> {
  if (!checkRateLimit(`upload-fin:${clientIp()}`, IP_LIMIT_PER_MIN, 60_000).allowed) {
    return fail('Lots of uploads at once. Trying again in a moment.', true);
  }
  const rules = MEDIA_RULES[input.mediaType];
  if (!rules || typeof input.path !== 'string' || !UPLOAD_PATH_RE.test(input.path)) {
    return fail('That upload is not valid.');
  }
  const ev = await loadGuestEvent(input.slug);
  if (!ev) return fail('This event could not be found.');
  if (!input.path.startsWith(`${ev.id}/`)) return fail('That upload is not valid.');
  if (!tierAllows(ev, input.mediaType)) return fail('That capture type is not available for this event.');

  const sb = getSupabaseAdmin()!;
  const storage = sb.storage.from(BUCKET);
  const { data: info, error: infoErr } = await storage.info(input.path);
  if (infoErr || !info) return fail('The upload has not arrived yet.', true);
  const size = Number((info as { size?: number }).size ?? 0);
  const type = baseType((info as { contentType?: string }).contentType);
  if (!rules.types[type] || size <= 0 || size > rules.maxBytes) {
    await storage.remove([input.path]);
    return fail('That file was not accepted.');
  }

  const filter = FILTERS.some((f) => f.id === input.filterName) ? input.filterName : 'none';
  const { data: pub } = storage.getPublicUrl(input.path);
  const { error } = await sb.from('submissions').insert({
    event_id: ev.id,
    media_url: pub.publicUrl,
    media_type: input.mediaType,
    filter_name: input.mediaType === 'voice' ? 'voice' : filter,
    guest_name: cleanString(input.guestName, LIMITS.GUEST_NAME) || null,
    approved: ev.auto_approve, // the DB trigger enforces this too
  });
  if (error) {
    if (error.code === '23505') return { ok: true }; // already recorded by an earlier retry
    if (/rate|limit/i.test(error.message)) return fail('Lots of captures right now. Retrying shortly.', true);
    return fail('Could not save your capture. Retrying shortly.', true);
  }
  return { ok: true };
}

/** Guest comment on a visible submission. */
export async function addCommentAction(input: {
  eventId: string;
  submissionId: string;
  guestName: string | null;
  body: string;
}): Promise<{ ok: true; comment: CommentRow } | Fail> {
  if (!checkRateLimit(`comment:${clientIp()}`, 120, 60_000).allowed) {
    return fail('You are commenting a lot. Try again in a minute.');
  }
  const body = cleanString(input.body, 280);
  if (!body) return fail('Comment is empty.');
  if (!isUuid(input.submissionId) || !isUuid(input.eventId)) return fail('That photo could not be found.');
  const { data: evRow } = await getSupabaseAdmin()!
    .from('events')
    .select('id, tier, wedding_date, auto_approve')
    .eq('id', input.eventId)
    .maybeSingle();
  const ev = evRow as GuestEvent | null;
  if (!ev) return fail('This event could not be found.');
  if (!getTier(ev.tier).features.comments) return fail('Comments are not available for this event.');

  const sb = getSupabaseAdmin()!;
  const { data: sub } = await sb
    .from('submissions')
    .select('id, approved')
    .eq('id', input.submissionId)
    .eq('event_id', ev.id)
    .maybeSingle();
  if (!sub || !(sub as { approved: boolean }).approved) return fail('That photo could not be found.');

  const { data, error } = await sb
    .from('comments')
    .insert({
      event_id: ev.id,
      submission_id: input.submissionId,
      guest_name: cleanString(input.guestName, LIMITS.GUEST_NAME) || null,
      body,
    })
    .select('*')
    .single();
  if (error || !data) return fail('Could not post your comment.');
  return { ok: true, comment: data as CommentRow };
}
