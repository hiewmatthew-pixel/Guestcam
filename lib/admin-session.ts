// Signed admin session cookie. The cookie value is `<expiry>.<hmac>` where
// the HMAC is keyed on ADMIN_PASSWORD, so it can't be forged from the
// browser, it expires on its own, and changing the password logs out
// every existing session.

import { createHmac } from 'crypto';
import { constantTimeEqual } from './validate';

export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sign(exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`ggc-admin:${exp}`).digest('base64url');
}

export function createAdminSession(secret: string, now = Date.now()): string {
  const exp = now + ADMIN_SESSION_TTL_MS;
  return `${exp}.${sign(exp, secret)}`;
}

export function verifyAdminSession(
  value: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!value || !secret) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isFinite(exp) || exp <= now) return false;
  return constantTimeEqual(value.slice(dot + 1), sign(exp, secret));
}
