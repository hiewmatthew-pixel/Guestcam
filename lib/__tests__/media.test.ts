import { describe, expect, it, vi } from 'vitest';
import { extForBlob, extensionFor } from '../media';
import { checkRateLimit, peekRateLimit } from '../rate-limit';

describe('media extensions', () => {
  it('follows the recorded container', () => {
    expect(extForBlob(new Blob([], { type: 'image/jpeg' }), 'photo')).toBe('jpg');
    expect(extForBlob(new Blob([], { type: 'video/mp4' }), 'video')).toBe('mp4');
    expect(extForBlob(new Blob([], { type: 'video/webm;codecs=vp9' }), 'boomerang')).toBe('webm');
    expect(extForBlob(new Blob([], { type: 'audio/mp4' }), 'voice')).toBe('m4a');
    expect(extForBlob(new Blob([], { type: 'audio/webm' }), 'voice')).toBe('webm');
  });

  it('reads stored rows by URL or data: mime', () => {
    expect(extensionFor({ media_type: 'video', media_url: 'https://x.supabase.co/a/b/1-u.mp4' })).toBe('mp4');
    expect(extensionFor({ media_type: 'voice', media_url: 'https://x/a/1-u.m4a?t=1' })).toBe('m4a');
    expect(extensionFor({ media_type: 'video', media_url: 'data:video/mp4;base64,AAA' })).toBe('mp4');
    expect(extensionFor({ media_type: 'voice', media_url: 'data:audio/mp4;base64,AAA' })).toBe('m4a');
    expect(extensionFor({ media_type: 'video', media_url: 'https://x/noext' })).toBe('webm');
    expect(extensionFor({ media_type: 'photo', media_url: 'https://x/a.png' })).toBe('jpg');
  });
});

describe('peekRateLimit', () => {
  it('reports budget without consuming it', () => {
    const key = `peek-${Math.random()}`;
    expect(peekRateLimit(key, 2)).toBe(true);
    expect(peekRateLimit(key, 2)).toBe(true);
    checkRateLimit(key, 2, 60_000);
    checkRateLimit(key, 2, 60_000);
    expect(peekRateLimit(key, 2)).toBe(false);
  });
});

describe('isTrustedMediaUrl', () => {
  it('only allows this project bucket, inside the row event folder', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co/');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.resetModules();
    const { isTrustedMediaUrl } = await import('../supabase');
    const ev = '11111111-1111-1111-1111-111111111111';
    const base = 'https://proj.supabase.co/storage/v1/object/public/submissions';
    expect(isTrustedMediaUrl({ event_id: ev, media_url: `${base}/${ev}/1-a.jpg` })).toBe(true);
    expect(isTrustedMediaUrl({ event_id: ev, media_url: `${base}/2222/1-a.jpg` })).toBe(false);
    expect(isTrustedMediaUrl({ event_id: ev, media_url: 'https://evil.com/x.jpg' })).toBe(false);
    expect(isTrustedMediaUrl({ event_id: ev, media_url: 'data:image/jpeg;base64,AA' })).toBe(true);
    vi.unstubAllEnvs();
  });
});
