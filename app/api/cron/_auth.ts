import 'server-only';
import { constantTimeEqual } from '@/lib/validate';

// Vercel Cron calls these routes with "Authorization: Bearer $CRON_SECRET".
// Without the secret configured, the jobs refuse to run at all.
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  return constantTimeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}
