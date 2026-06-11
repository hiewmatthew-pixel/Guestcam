'use server';

import { cookies, headers } from 'next/headers';
import { constantTimeEqual, sleep } from '@/lib/validate';
import { checkRateLimit } from '@/lib/rate-limit';

const COOKIE = 'ggc_admin';

function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') || 'unknown';
}

export async function checkAdminPassword(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  // baseline delay on every attempt — slows scripted brute-force loops
  // without noticeably affecting humans
  await sleep(250 + Math.floor(Math.random() * 150));

  // hard cap on attempts per IP: 8 per 5 minutes
  const rl = checkRateLimit(`admin-login:${clientIp()}`, 8, 5 * 60_000);
  if (!rl.allowed) {
    return { ok: false, error: 'Too many attempts. Wait a few minutes and try again.' };
  }

  const password = String(formData.get('password') ?? '');
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false, error: 'ADMIN_PASSWORD is not set on the server.' };
  }
  if (!constantTimeEqual(password, expected)) {
    return { ok: false, error: 'Wrong password.' };
  }
  cookies().set(COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return { ok: true };
}

export async function isAdminAuthed(): Promise<boolean> {
  return cookies().get(COOKIE)?.value === '1';
}

export async function adminLogout(): Promise<void> {
  cookies().delete(COOKIE);
}

/** For use inside other server actions — throws if not authed. */
export async function requireAdmin(): Promise<void> {
  const ok = await isAdminAuthed();
  if (!ok) throw new Error('Not authorized.');
}
