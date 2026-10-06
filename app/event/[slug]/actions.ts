'use server';

import { headers } from 'next/headers';
import { addComment } from '@/lib/guest-writes';
import type { CommentRow } from '@/lib/supabase';

function clientIp(): string {
  const h = headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

/** Guest comment, checked + rate-limited server-side (see lib/guest-writes.ts). */
export async function addCommentAction(input: {
  eventId: string;
  submissionId: string;
  guestName: string | null;
  body: string;
}): Promise<{ ok: true; comment: CommentRow } | { ok: false; error: string; retry: boolean }> {
  return addComment(clientIp(), input);
}
