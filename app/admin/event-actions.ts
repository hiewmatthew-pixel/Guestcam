'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from './actions';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import { generateManageToken } from '@/lib/tokens';
import { cleanString, LIMITS, toSlug, ValidationError } from '@/lib/validate';
import { TIER_LIST, DEFAULT_TIER, type TierId } from '@/lib/tiers';

type CreateInput = {
  couple_names: string;
  wedding_date: string; // YYYY-MM-DD
  welcome_message?: string | null;
  tier?: string;
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

    const sb = getSupabaseAdmin()!;
    const { error } = await sb.from('events').insert({
      slug,
      couple_names,
      wedding_date,
      welcome_message,
      tier,
      manage_token: generateManageToken(),
    });
    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'An event with that slug already exists.' };
      }
      return { ok: false, error: error.message };
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
    await sb.from('submissions').delete().eq('event_id', id);
    const { error } = await sb.from('events').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin');
    return { ok: true };
  } catch (e: any) {
    if (e?.message === 'Not authorized.') return { ok: false, error: 'Not authorized.' };
    return { ok: false, error: 'Could not delete event.' };
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
    if (error) return { ok: false, error: error.message };
    return { ok: true, manage_token: next };
  } catch (e: any) {
    if (e?.message === 'Not authorized.') return { ok: false, error: 'Not authorized.' };
    return { ok: false, error: 'Could not rotate token.' };
  }
}
