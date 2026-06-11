import { describe, it, expect } from 'vitest';
import {
  cleanString,
  constantTimeEqual,
  toSlug,
  safeFilenamePart,
  LIMITS,
} from '../validate';

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc-def-ghj', 'abc-def-ghj')).toBe(true);
  });
  it('returns false for different same-length strings', () => {
    expect(constantTimeEqual('abc-def-ghj', 'abc-def-ghk')).toBe(false);
  });
  it('returns false for different-length strings', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', 'x')).toBe(false);
  });
  it('returns true for two empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });
  it('is not fooled by type coercion', () => {
    // @ts-expect-error intentional wrong type
    expect(constantTimeEqual(null, 'null')).toBe(false);
    // @ts-expect-error intentional wrong type
    expect(constantTimeEqual(undefined, undefined)).toBe(false);
  });
});

describe('cleanString', () => {
  it('strips control characters (incl. zero-width via control range)', () => {
    expect(cleanString('a\x00b\x1Fc', 50)).toBe('abc');
  });
  it('collapses whitespace and trims', () => {
    expect(cleanString('  hello   world  ', 50)).toBe('hello world');
  });
  it('enforces the max length', () => {
    expect(cleanString('x'.repeat(200), LIMITS.GUEST_NAME).length).toBe(
      LIMITS.GUEST_NAME,
    );
  });
  it('returns empty string for non-strings', () => {
    expect(cleanString(42, 10)).toBe('');
    expect(cleanString(null, 10)).toBe('');
    expect(cleanString(undefined, 10)).toBe('');
  });
});

describe('toSlug', () => {
  it('builds a stable slug with the year', () => {
    expect(toSlug('Sarah & James', '2026')).toBe('sarah-and-james-2026');
  });
  it('strips unsafe characters and collapses dashes', () => {
    expect(toSlug('A**B  C', '2025')).toBe('a-b-c-2025');
  });
  it('has no path-traversal characters', () => {
    expect(toSlug('../etc/passwd', '2026')).not.toContain('/');
    expect(toSlug('../etc/passwd', '2026')).not.toContain('..');
  });
});

describe('safeFilenamePart', () => {
  it('falls back to "guest" for empty/nullish', () => {
    expect(safeFilenamePart(null)).toBe('guest');
    expect(safeFilenamePart('')).toBe('guest');
    expect(safeFilenamePart('!!!')).toBe('guest');
  });
  it('strips path separators and unsafe chars', () => {
    expect(safeFilenamePart('a/b\\c')).not.toMatch(/[\/\\]/);
  });
});
