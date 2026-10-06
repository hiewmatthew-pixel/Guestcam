import 'server-only';
import { NextResponse } from 'next/server';

// Stable endpoints for the guest upload queue. Unlike server actions, their
// URLs don't change on redeploy, so a phone that's had the page open all
// night keeps sending after a mid-event deploy.

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Same-origin JSON only (blocks cross-site form posts), bounded size. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return null;
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return null;
  const text = await req.text();
  if (text.length > 4_000) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
