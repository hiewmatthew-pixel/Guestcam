'use server';

import { cookies } from 'next/headers';
import { constantTimeEqual, sleep } from '@/lib/validate';

const COOKIE = 'ggc_admin';

export async function checkAdminPassword(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  // baseline delay on every attempt — slows scripted brute-force loops
  // without noticeably affecting humans
  await sleep(250 + Math.floor(Math.random() * 150));

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
