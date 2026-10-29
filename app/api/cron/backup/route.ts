import { NextResponse } from 'next/server';
import { runBackup } from '@/lib/lifecycle';
import { isCronAuthorized } from '../_auth';

// Hourly (vercel.json): copy new captures to the private Blob backup.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse('Unauthorized', { status: 401 });
  try {
    const result = await runBackup(240_000);
    console.log('[cron/backup]', JSON.stringify(result));
    return NextResponse.json(result, { status: result.failed ? 207 : 200 });
  } catch (e) {
    console.error('[cron/backup] failed', (e as Error).message);
    return NextResponse.json({ error: 'backup failed' }, { status: 500 });
  }
}
