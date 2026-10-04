'use server';

import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  isUuid,
  notifyModerationChange,
} from '@/lib/supabase-admin';
import { cleanString, constantTimeEqual, LIMITS } from '@/lib/validate';
import { checkRateLimit, peekRateLimit } from '@/lib/rate-limit';
import {
  PUBLIC_EVENT_COLUMNS,
  toEventRow,
  type EventRow,
  type PublicEvent,
  type SubmissionRow,
} from '@/lib/supabase';
import { headers } from 'next/headers';

function clientIp(): string {
  const h = headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

type AuthOk = { ok: true; eventId: string };
type AuthErr = { ok: false; error: string; reason: 'missing' | 'denied' | 'config' | 'rate' };

/**
 * Single gate for every portal mutation: validate slug + token, look the
 * event up with the service role, constant-time compare the token. All
 * portal actions route through this so the auth + rate-limit logic lives
 * in exactly one place. Returns the verified event id on success.
 */
async function authorizePortal(slugRaw: string, tokenRaw: string): Promise<AuthOk | AuthErr> {
  if (!isSupabaseAdminConfigured) {
    return { ok: false, error: 'Server is not configured for Supabase writes.', reason: 'config' };
  }
  const slug = cleanString(slugRaw, LIMITS.SLUG);
  const token = String(tokenRaw || '').slice(0, LIMITS.TOKEN);
  if (!slug || !token) return { ok: false, error: 'Missing slug or token.', reason: 'missing' };

  // Throttle brute-force guessing. Only FAILED attempts count, keyed by
  // slug + IP, so a couple moderating quickly never locks themselves out
  // and a stranger can't lock the portal for everyone.
  const rlKey = `portal-fail:${slug}:${clientIp()}`;
  if (!peekRateLimit(rlKey, 20)) {
    return { ok: false, error: 'Too many attempts. Try again shortly.', reason: 'rate' };
  }

  const sb = getSupabaseAdmin()!;
  const { data: ev, error } = await sb
    .from('events')
    .select('id, manage_token')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !ev) return { ok: false, error: 'Event not found.', reason: 'missing' };
  if (!constantTimeEqual(token, (ev as { manage_token: string }).manage_token)) {
    checkRateLimit(rlKey, 20, 5 * 60_000);
    return { ok: false, error: 'Invalid portal link.', reason: 'denied' };
  }
  return { ok: true, eventId: (ev as { id: string }).id };
}

/**
 * Verify the portal token and return the event WITHOUT its manage_token.
 * The couple's portal calls this instead of reading the events table from
 * the browser, so the token never leaves the server.
 */
export async function getPortalEventAction(input: {
  slug: string;
  token: string;
}): Promise<
  | { ok: true; event: EventRow }
  | { ok: false; reason: 'missing' | 'denied' | 'config' | 'rate'; error: string }
> {
  const auth = await authorizePortal(input.slug, input.token);
  if (!auth.ok) return { ok: false, reason: auth.reason, error: auth.error };

  const sb = getSupabaseAdmin()!;
  const { data, error } = await sb
    .from('events')
    .select(PUBLIC_EVENT_COLUMNS)
    .eq('id', auth.eventId)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: 'missing', error: 'Event not found.' };
  return { ok: true, event: toEventRow(data as PublicEvent) };
}

export async function updateWelcomeAction(input: {
  slug: string;
  token: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizePortal(input.slug, input.token);
  if (!auth.ok) return { ok: false, error: auth.error };

  const message = cleanString(input.message, LIMITS.WELCOME_MESSAGE);
  const sb = getSupabaseAdmin()!;
  const { error } = await sb
    .from('events')
    .update({ welcome_message: message || null })
    .eq('id', auth.eventId);
  if (error) return { ok: false, error: 'Could not save. Please try again.' };
  return { ok: true };
}

/**
 * Approve or hide a single submission. Gated by the couple's
 * manage_token. The submission must belong to the slug's event so a
 * leaked token can only ever moderate its own event.
 */
export async function setSubmissionApprovedAction(input: {
  slug: string;
  token: string;
  submission_id: string;
  approved: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const id = input.submission_id;
  if (!isUuid(id)) return { ok: false, error: 'Bad submission id.' };
  const auth = await authorizePortal(input.slug, input.token);
  if (!auth.ok) return { ok: false, error: auth.error };

  const sb = getSupabaseAdmin()!;
  const { error } = await sb
    .from('submissions')
    .update({ approved: input.approved })
    .eq('id', id)
    .eq('event_id', auth.eventId);
  if (error) return { ok: false, error: 'Could not update. Please try again.' };
  await notifyModerationChange(auth.eventId);
  return { ok: true };
}

/**
 * Flip the auto-approve flag for an event. Same token gating.
 */
export async function setAutoApproveAction(input: {
  slug: string;
  token: string;
  auto_approve: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizePortal(input.slug, input.token);
  if (!auth.ok) return { ok: false, error: auth.error };

  const sb = getSupabaseAdmin()!;
  const { error } = await sb
    .from('events')
    .update({ auto_approve: !!input.auto_approve })
    .eq('id', auth.eventId);
  if (error) return { ok: false, error: 'Could not update. Please try again.' };
  return { ok: true };
}

/**
 * Every submission for the couple's event, pending and hidden included.
 * Anon RLS only exposes approved rows, so the portal reads through here.
 */
export async function listPortalSubmissionsAction(input: {
  slug: string;
  token: string;
}): Promise<SubmissionRow[] | null> {
  const auth = await authorizePortal(input.slug, input.token);
  if (!auth.ok) return null;
  const { data, error } = await getSupabaseAdmin()!
    .from('submissions')
    .select('*')
    .eq('event_id', auth.eventId)
    .order('created_at', { ascending: false });
  if (error) return null;
  return (data ?? []) as SubmissionRow[];
}
