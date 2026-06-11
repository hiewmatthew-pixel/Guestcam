import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../rate-limit';

describe('checkRateLimit', () => {
  it('allows up to the limit then blocks', () => {
    const key = `t-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('keeps separate budgets per key', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    checkRateLimit(a, 1, 60_000);
    expect(checkRateLimit(a, 1, 60_000).allowed).toBe(false);
    // different key is unaffected
    expect(checkRateLimit(b, 1, 60_000).allowed).toBe(true);
  });

  it('resets after the window elapses', async () => {
    const key = `w-${Math.random()}`;
    expect(checkRateLimit(key, 1, 30).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 30).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(checkRateLimit(key, 1, 30).allowed).toBe(true);
  });
});
