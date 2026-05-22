'use server';

import { cookies } from 'next/headers';

const COOKIE = 'ggc_admin';

export async function checkAdminPassword(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const password = String(formData.get('password') ?? '');
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false, error: 'ADMIN_PASSWORD is not set on the server.' };
  }
  if (password !== expected) {
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

export async function adminLogout() {
  cookies().delete(COOKIE);
}
