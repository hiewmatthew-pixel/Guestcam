import { describe, expect, it } from 'vitest';
import { ADMIN_SESSION_TTL_MS, createAdminSession, verifyAdminSession } from '../admin-session';

describe('admin session cookie', () => {
  const secret = 'correct horse battery staple';
  const now = 1_800_000_000_000;

  it('accepts a freshly issued session', () => {
    expect(verifyAdminSession(createAdminSession(secret, now), secret, now)).toBe(true);
  });

  it('rejects the old forgeable "1" value and junk', () => {
    for (const v of ['1', '', 'abc', '.', `${now + 1000}.`, `${now + 1000}.nope`]) {
      expect(verifyAdminSession(v, secret, now)).toBe(false);
    }
    expect(verifyAdminSession(undefined, secret, now)).toBe(false);
  });

  it('rejects an expired session', () => {
    const v = createAdminSession(secret, now);
    expect(verifyAdminSession(v, secret, now + ADMIN_SESSION_TTL_MS + 1)).toBe(false);
  });

  it('rejects a tampered expiry', () => {
    const [, mac] = createAdminSession(secret, now).split('.');
    expect(verifyAdminSession(`${now + 10 * ADMIN_SESSION_TTL_MS}.${mac}`, secret, now)).toBe(false);
  });

  it('is invalidated when the password changes or is unset', () => {
    const v = createAdminSession(secret, now);
    expect(verifyAdminSession(v, 'new password', now)).toBe(false);
    expect(verifyAdminSession(v, undefined, now)).toBe(false);
  });
});
