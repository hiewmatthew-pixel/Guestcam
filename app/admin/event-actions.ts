'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from './actions';
import {
  deleteEventMedia,
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  isUuid,
  notifyModerationChange,
} from '@/lib/supabase-admin';
import { generateManageToken } from '@/lib/tokens';
import { cleanString, LIMITS, toSlug, ValidationError } from '@/lib/validate';
import { TIER_LIST, DEFAULT_TIER, getTier, type TierId } from '@/lib/tiers';
import type { EventRow, SubmissionRow } from '@/lib/supabase';

/**
 * Admin-only event reads. The admin pages can't use the anon client for
 * these because anon no longer has SELECT on the manage_token column,
 * and the admin needs that token to build the couple's portal link.
 * These run with the service role after verifying the admin cookie.
 */
export async function adminListEventsAction(): Promise<EventRow[]> {
  try {
    await requireAdmin();
    if (!isSupabaseAdminConfigured) return [];
    const sb = getSupabaseAdmin()!;
    const { data } = await sb
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });
    return (data ?? []) as EventRow[];
  } catch {
    return [];
  }
}

export async function adminGetEventBySlugAction(
  slug: string,
): Promise<EventRow | null> {
  try {
    await requireAdmin();
    if (!isSupabaseAdminConfigured) return null;
    const clean = cleanString(slug, LIMITS.SLUG);
    if (!clean) return null;
    const sb = getSupabaseAdmin()!;
    const { data } = await sb
      .from('events')
      .select('*')
      .eq('slug', clean)
      .maybeSingle();
    return (data as EventRow) ?? null;
  } catch {
    return null;
  }
}

type CreateInput = {
  couple_names: string;
  wedding_date: string; // YYYY-MM-DD
  welcome_message?: string | null;
  tier?: string;
  reveal_at?: string | null;       // ISO timestamp, optional
  auto_approve?: boolean;          // defaults true
};

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

function validTier(t: string | undefined): TierId {
  const valid = TIER_LIST.find((x) => x.id === t);
  return valid ? valid.id : DEFAULT_TIER;
}

export async function createEventAction(
  input: CreateInput,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    if (!isSupabaseAdminConfigured) {
      return { ok: false, error: 'Supabase service role key is not configured on the server.' };
    }

    const couple_names = cleanString(input.couple_names, LIMITS.COUPLE_NAMES);
    const welcome_message =
      input.welcome_message ? cleanString(input.welcome_message, LIMITS.WELCOME_MESSAGE) || null : null;
    const wedding_date = String(input.wedding_date || '');
    const tier = validTier(input.tier);

    if (!couple_names) throw new ValidationError('Couple names are required.');
    if (!isValidDate(wedding_date)) throw new ValidationError('Wedding date is invalid.');

    const slug = toSlug(couple_names, wedding_date.slice(0, 4));
    if (!slug || slug.length > LIMITS.SLUG) throw new ValidationError('Could not build a slug from the names.');

    // reveal_at is only honoured on tiers that include the reveal feature
    let reveal_at: string | null = null;
    if (input.reveal_at && getTier(tier).features.revealMode) {
      const ts = new Date(input.reveal_at);
      if (!Number.isNaN(ts.getTime())) reveal_at = ts.toISOString();
    }
    const auto_approve = input.auto_approve === false ? false : true;

    const sb = getSupabaseAdmin()!;
    const { error } = await sb.from('events').insert({
      slug,
      couple_names,
      wedding_date,
      welcome_message,
      tier,
      manage_token: generateManageToken(),
      reveal_at,
      auto_approve,
    });
    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'An event with that slug already exists.' };
      }
      return { ok: false, error: 'Could not create event.' };
    }
    revalidatePath('/admin');
    return { ok: true, slug };
  } catch (e: any) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    if (e?.message === 'Not authorized.') return { ok: false, error: 'Not authorized.' };
    return { ok: false, error: 'Could not create event.' };
  }
}

export async function deleteEventAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!isSupabaseAdminConfigured) {
      return { ok: false, error: 'Supabase service role key is not configured on the server.' };
    }
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return { ok: false, error: 'Bad event id.' };
    }
    const sb = getSupabaseAdmin()!;
    // the bucket is public, so remove the files too, not just the rows
    await deleteEventMedia(id);
    await sb.from('submissions').delete().eq('event_id', id);
    const { error } = await sb.from('events').delete().eq('id', id);
    if (error) return { ok: false, error: 'Could not delete event.' };
    revalidatePath('/admin');
    return { ok: true };
  } catch (e: any) {
    if (e?.message === 'Not authorized.') return { ok: false, error: 'Not authorized.' };
    return { ok: false, error: 'Could not delete event.' };
  }
}

export async function adminSetSubmissionApprovedAction(input: {
  submission_id: string;
  approved: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!isSupabaseAdminConfigured) {
      return { ok: false, error: 'Supabase service role key is not configured on the server.' };
    }
    const id = input.submission_id;
    if (!isUuid(id)) return { ok: false, error: 'Bad submission id.' };
    const sb = getSupabaseAdmin()!;
    const { data, error } = await sb
      .from('submissions')
      .update({ approved: !!input.approved })
      .eq('id', id)
      .select('event_id')
      .maybeSingle();
    if (error) return { ok: false, error: 'Could not update.' };
    if (data?.event_id) await notifyModerationChange(data.event_id as string);
    return { ok: true };
  } catch (e: any) {
    if (e?.message === 'Not authorized.') return { ok: false, error: 'Not authorized.' };
    return { ok: false, error: 'Could not update.' };
  }
}

export async function rotateTokenAction(
  id: string,
): Promise<{ ok: true; manage_token: string } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    if (!isSupabaseAdminConfigured) {
      return { ok: false, error: 'Supabase service role key is not configured on the server.' };
    }
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return { ok: false, error: 'Bad event id.' };
    }
    const sb = getSupabaseAdmin()!;
    const next = generateManageToken();
    const { error } = await sb.from('events').update({ manage_token: next }).eq('id', id);
    if (error) return { ok: false, error: 'Could not rotate token.' };
    return { ok: true, manage_token: next };
  } catch (e: any) {
    if (e?.message === 'Not authorized.') return { ok: false, error: 'Not authorized.' };
    return { ok: false, error: 'Could not rotate token.' };
  }
}

/** Every submission for an event (pending + hidden), for the admin page. */
export async function adminListSubmissionsAction(eventId: string): Promise<SubmissionRow[] | null> {
  try {
    await requireAdmin();
    if (!isSupabaseAdminConfigured || !isUuid(eventId)) return null;
    const { data, error } = await getSupabaseAdmin()!
      .from('submissions')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) return null;
    return (data ?? []) as SubmissionRow[];
  } catch {
    return null;
  }
}
