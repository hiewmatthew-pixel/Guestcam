'use server';

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import { cleanString, constantTimeEqual, LIMITS } from '@/lib/validate';

export async function updateWelcomeAction(input: {
  slug: string;
  token: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseAdminConfigured) {
    // not an error in demo mode — the client falls back to localStorage
    return { ok: false, error: 'Server is not configured for Supabase writes.' };
  }
  const slug = cleanString(input.slug, LIMITS.SLUG);
  const token = String(input.token || '').slice(0, LIMITS.TOKEN);
  const message = cleanString(input.message, LIMITS.WELCOME_MESSAGE);

  if (!slug || !token) return { ok: false, error: 'Missing slug or token.' };

  const sb = getSupabaseAdmin()!;
  // 1. look up the event by slug
  const { data: ev, error: lookupErr } = await sb
    .from('events')
    .select('id, manage_token')
    .eq('slug', slug)
    .maybeSingle();
  if (lookupErr || !ev) return { ok: false, error: 'Event not found.' };

  // 2. constant-time compare the token
  if (!constantTimeEqual(token, (ev as any).manage_token as string)) {
    return { ok: false, error: 'Invalid portal link.' };
  }

  // 3. update — using service role, but only for this validated event id
  const { error } = await sb
    .from('events')
    .update({ welcome_message: message || null })
    .eq('id', (ev as any).id);
  if (error) return { ok: false, error: error.message };
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
  if (!isSupabaseAdminConfigured) {
    return { ok: false, error: 'Server is not configured for Supabase writes.' };
  }
  const slug = cleanString(input.slug, LIMITS.SLUG);
  const token = String(input.token || '').slice(0, LIMITS.TOKEN);
  const id = String(input.submission_id || '').slice(0, 80);
  if (!slug || !token || !id) return { ok: false, error: 'Missing fields.' };

  const sb = getSupabaseAdmin()!;
  const { data: ev, error: lookupErr } = await sb
    .from('events')
    .select('id, manage_token')
    .eq('slug', slug)
    .maybeSingle();
  if (lookupErr || !ev) return { ok: false, error: 'Event not found.' };
  if (!constantTimeEqual(token, (ev as any).manage_token as string)) {
    return { ok: false, error: 'Invalid portal link.' };
  }

  const { error } = await sb
    .from('submissions')
    .update({ approved: input.approved })
    .eq('id', id)
    .eq('event_id', (ev as any).id);
  if (error) return { ok: false, error: error.message };
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
  if (!isSupabaseAdminConfigured) {
    return { ok: false, error: 'Server is not configured for Supabase writes.' };
  }
  const slug = cleanString(input.slug, LIMITS.SLUG);
  const token = String(input.token || '').slice(0, LIMITS.TOKEN);
  if (!slug || !token) return { ok: false, error: 'Missing fields.' };

  const sb = getSupabaseAdmin()!;
  const { data: ev, error: lookupErr } = await sb
    .from('events')
    .select('id, manage_token')
    .eq('slug', slug)
    .maybeSingle();
  if (lookupErr || !ev) return { ok: false, error: 'Event not found.' };
  if (!constantTimeEqual(token, (ev as any).manage_token as string)) {
    return { ok: false, error: 'Invalid portal link.' };
  }

  const { error } = await sb
    .from('events')
    .update({ auto_approve: !!input.auto_approve })
    .eq('id', (ev as any).id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
