// Server-only guest write path: uploads, captures, comments.
//
// The anon key can't write anything (supabase/schema.sql). Guests go
// through these functions, exposed as stable route handlers
// (app/api/upload/*) for the upload queue and a server action for
// comments. Every upload link the server issues is recorded in the
// private pending_uploads table with the event and media type it was
// issued for; finalize trusts that record, never the client's word, and
// only ever deletes a file that is still pending (never one that already
// belongs to a submission). The database adds hard per-event caps.

import 'server-only';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin, isUuid, notifyModerationChange } from './supabase-admin';
import { checkRateLimit } from './rate-limit';
import { cleanString, LIMITS } from './validate';
import { getTier } from './tiers';
import { FILTERS } from './filters';
import type { CommentRow, MediaType } from './supabase';

const BUCKET = 'submissions';
const DAY = 24 * 60 * 60 * 1000;
const STALE_PENDING_MS = 3 * 60 * 60 * 1000; // signed URLs last 2 h
// Per-IP limits are generous on purpose: a venue's guests often share ONE
// public Wi-Fi IP, and the first dance produces bursts. They stop a single
// script hammering us; the hard per-event caps live in the database.
const IP_LIMIT_PER_MIN = 300;

export const MEDIA_RULES: Record<MediaType, { types: Record<string, string>; maxBytes: number }> = {
  photo: { types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }, maxBytes: 15 * 1024 * 1024 },
  video: { types: { 'video/mp4': 'mp4', 'video/webm': 'webm' }, maxBytes: 30 * 1024 * 1024 },
  boomerang: { types: { 'video/mp4': 'mp4', 'video/webm': 'webm' }, maxBytes: 30 * 1024 * 1024 },
  voice: { types: { 'audio/mp4': 'm4a', 'audio/webm': 'webm' }, maxBytes: 10 * 1024 * 1024 },
};

const UPLOAD_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{10,16}-[0-9a-f-]{36}\.(jpg|png|webp|webm|mp4|m4a)$/i;

type GuestEvent = { id: string; tier: string; wedding_date: string; auto_approve: boolean };
export type Fail = { ok: false; error: string; retry: boolean };
const fail = (error: string, retry = false): Fail => ({ ok: false, error, retry });

/** Base MIME type without codec parameters ("video/webm;codecs=vp9" -> "video/webm"). */
function baseType(contentType: unknown): string {
  return typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : '';
}

/**
 * Captures are accepted from two weeks before the wedding (so the couple
 * and studio can test) until the guest gallery closes, padded a day each
 * side so time zones never cut a guest off on the night. `graceMs` lets an
 * upload that started just before closing still be recorded.
 */
function captureWindowOpen(ev: GuestEvent, graceMs = 0, now = Date.now()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ev.wedding_date);
  if (!m) return false;
  const wedding = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const closes = wedding + (getTier(ev.tier).features.galleryDays + 2) * DAY + graceMs;
  return now >= wedding - 14 * DAY && now <= closes;
}

function tierAllows(ev: GuestEvent, mediaType: MediaType): boolean {
  const f = getTier(ev.tier).features;
  if (mediaType === 'video') return f.allowVideo;
  if (mediaType === 'boomerang') return f.allowBoomerang;
  if (mediaType === 'voice') return f.voiceNotes;
  return true;
}

async function loadEvent(by: 'slug' | 'id', value: unknown): Promise<GuestEvent | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const v = by === 'slug' ? cleanString(value, LIMITS.SLUG) : isUuid(value) ? value : '';
  if (!v) return null;
  const { data } = await sb
    .from('events')
    .select('id, tier, wedding_date, auto_approve')
    .eq(by, v)
    .maybeSingle();
  return (data as GuestEvent | null) ?? null;
}

/** Delete this event's uploads that were never finalized (abandoned or abusive). */
async function sweepStalePending(eventId: string) {
  const sb = getSupabaseAdmin()!;
  const cutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const { data } = await sb
    .from('pending_uploads')
    .select('path')
    .eq('event_id', eventId)
    .lt('created_at', cutoff)
    .limit(100);
  const paths = (data ?? []).map((r: { path: string }) => r.path);
  if (paths.length === 0) return;
  await sb.storage.from(BUCKET).remove(paths);
  await sb.from('pending_uploads').delete().in('path', paths);
}

/**
 * Step 1: validate up front, record the issued path, and hand back a
 * one-time signed upload URL. The bytes go straight from the phone to
 * storage (no 30 MB bodies through Vercel).
 */
export async function requestUpload(
  ip: string,
  input: Record<string, unknown>,
): Promise<{ ok: true; path: string; signedUrl: string } | Fail> {
  if (!checkRateLimit(`upload-req:${ip}`, IP_LIMIT_PER_MIN, 60_000).allowed) {
    return fail('Lots of uploads at once. Trying again in a moment.', true);
  }
  const mediaType = input.mediaType as MediaType;
  const rules = MEDIA_RULES[mediaType];
  if (!rules) return fail('That capture type is not supported.');
  const ext = rules.types[baseType(input.contentType)];
  if (!ext) return fail('That file type is not supported.');
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0 || size > rules.maxBytes) {
    return fail(`That file is too large (max ${Math.round(rules.maxBytes / 1024 / 1024)} MB).`);
  }

  const ev = await loadEvent('slug', input.slug);
  if (!ev) return fail('This event could not be found.');
  if (!captureWindowOpen(ev)) return fail('This event is no longer accepting captures.');
  if (!tierAllows(ev, mediaType)) return fail('That capture type is not available for this event.');

  const sb = getSupabaseAdmin()!;
  await sweepStalePending(ev.id).catch(() => {});

  const path = `${ev.id}/${Date.now()}-${randomUUID()}.${ext}`;
  // the DB caps how many open upload links an event can have at once
  const { error: pendErr } = await sb
    .from('pending_uploads')
    .insert({ path, event_id: ev.id, media_type: mediaType });
  if (pendErr) return fail('Lots of uploads right now. Trying again shortly.', true);

  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    await sb.from('pending_uploads').delete().eq('path', path);
    return fail('Could not start the upload. Trying again shortly.', true);
  }
  return { ok: true, path, signedUrl: data.signedUrl };
}

/**
 * Step 2: record a capture whose bytes are in storage. Only paths this
 * server issued (pending_uploads) can be finalized, with the media type
 * they were issued for. Idempotent: a retry after success returns ok.
 */
export async function finalizeSubmission(
  ip: string,
  input: Record<string, unknown>,
): Promise<{ ok: true } | Fail> {
  if (!checkRateLimit(`upload-fin:${ip}`, IP_LIMIT_PER_MIN, 60_000).allowed) {
    return fail('Lots of uploads at once. Trying again in a moment.', true);
  }
  const path = typeof input.path === 'string' ? input.path : '';
  if (!UPLOAD_PATH_RE.test(path)) return fail('That upload is not valid.');
  const ev = await loadEvent('slug', input.slug);
  if (!ev || !path.startsWith(`${ev.id}/`)) return fail('That upload is not valid.');

  const sb = getSupabaseAdmin()!;
  const storage = sb.storage.from(BUCKET);
  const mediaUrl = storage.getPublicUrl(path).data.publicUrl;

  const { data: pending } = await sb
    .from('pending_uploads')
    .select('media_type')
    .eq('path', path)
    .eq('event_id', ev.id)
    .maybeSingle();
  if (!pending) {
    // already recorded by an earlier attempt → success; otherwise never issued
    const { data: existing } = await sb.from('submissions').select('id').eq('media_url', mediaUrl).maybeSingle();
    return existing ? { ok: true } : fail('That upload is not valid.');
  }
  const mediaType = (pending as { media_type: MediaType }).media_type;
  const rules = MEDIA_RULES[mediaType];
  if (!captureWindowOpen(ev, 2 * 60 * 60 * 1000)) return fail('This event is no longer accepting captures.');

  const { data: info, error: infoErr } = await storage.info(path);
  if (infoErr || !info) return fail('The upload has not arrived yet.', true);
  const size = Number((info as { size?: number }).size ?? 0);
  const type = baseType((info as { contentType?: string }).contentType);
  if (!rules.types[type] || size <= 0 || size > rules.maxBytes) {
    // safe to delete: it is still pending, so no submission points at it
    await storage.remove([path]);
    await sb.from('pending_uploads').delete().eq('path', path);
    return fail('That file was not accepted.');
  }

  const filterName = String(input.filterName ?? '');
  const filter = FILTERS.some((f) => f.id === filterName) ? filterName : 'none';
  const { error } = await sb.from('submissions').insert({
    event_id: ev.id,
    media_url: mediaUrl,
    media_type: mediaType,
    filter_name: mediaType === 'voice' ? 'voice' : filter,
    guest_name: cleanString(input.guestName, LIMITS.GUEST_NAME) || null,
    approved: ev.auto_approve, // the DB trigger enforces this too
  });
  if (error && error.code !== '23505') {
    if (/^rate limit/i.test(error.message)) return fail('Lots of captures right now. Retrying shortly.', true);
    if (/^limit:/i.test(error.message)) return fail('This event has reached its capture limit.');
    return fail('Could not save your capture. Retrying shortly.', true);
  }
  await sb.from('pending_uploads').delete().eq('path', path);
  // galleries / TV / portal reload (anon can't subscribe to the table)
  await notifyModerationChange(ev.id);
  return { ok: true };
}

/** Guest comment on a visible (approved, revealed, unexpired) submission. */
export async function addComment(
  ip: string,
  input: Record<string, unknown>,
): Promise<{ ok: true; comment: CommentRow } | Fail> {
  if (!checkRateLimit(`comment:${ip}`, 120, 60_000).allowed) {
    return fail('Lots of comments right now. Try again in a minute.');
  }
  const body = cleanString(input.body, 280);
  if (!body) return fail('Comment is empty.');
  if (!isUuid(input.submissionId)) return fail('That photo could not be found.');
  const ev = await loadEvent('id', input.eventId);
  if (!ev) return fail('That photo could not be found.');
  if (!getTier(ev.tier).features.comments) return fail('Comments are not available for this event.');

  const sb = getSupabaseAdmin()!;
  const [{ data: sub }, { data: open }] = await Promise.all([
    sb.from('submissions').select('id, approved').eq('id', input.submissionId).eq('event_id', ev.id).maybeSingle(),
    sb.rpc('event_gallery_open', { eid: ev.id }),
  ]);
  if (!sub || !(sub as { approved: boolean }).approved || open !== true) {
    return fail('That photo could not be found.');
  }

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
  const comment = data as CommentRow;
  // live update for open threads (anon can't subscribe to the table)
  await notifyCommentAdded(ev.id, comment);
  return { ok: true, comment };
}

async function notifyCommentAdded(eventId: string, comment: CommentRow) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    const ch = sb.channel(`comments-${eventId}`);
    await ch.httpSend('comment', comment);
    sb.removeChannel(ch);
  } catch {
    /* best effort */
  }
}
