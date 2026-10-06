import { finalizeSubmission } from '@/lib/guest-writes';
import { clientIp, json, readJson } from '../_shared';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ ok: false, error: 'Bad request.', retry: false }, 400);
  return json(await finalizeSubmission(clientIp(req), body));
}
