import { NextResponse } from 'next/server';
import { runPurge } from '@/lib/lifecycle';
import { isCronAuthorized } from '../_auth';

// Daily (vercel.json): permanently delete events past their tier's retention.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse('Unauthorized', { status: 401 });
  try {
    const result = await runPurge();
    console.log('[cron/lifecycle]', JSON.stringify(result));
    return NextResponse.json(result, { status: result.failed.length ? 207 : 200 });
  } catch (e) {
    console.error('[cron/lifecycle] failed', (e as Error).message);
    return NextResponse.json({ error: 'lifecycle failed' }, { status: 500 });
  }
}
