// Server-only media lifecycle: the off-site backup and tiered deletion.
//
// Backup: every capture's original file is copied from the Supabase
// "submissions" bucket to a PRIVATE Vercel Blob store (same path, under
// submissions/), so a Supabase outage, a bad migration or an accidental
// delete never loses a wedding. Runs hourly (app/api/cron/backup).
//
// Deletion: once wedding_date + the tier's retentionDays passes
// (lib/tiers.ts), every file (Supabase AND the backup), submission and
// comment for the event is permanently removed and events.purged_at is
// stamped. The event row stays as a minimal booking record. Runs daily
// (app/api/cron/lifecycle). Anything that fails is left unstamped, so the
// next run picks it up again.

import 'server-only';
import { del, list, put } from '@vercel/blob';
import { getSupabaseAdmin, deleteEventMedia } from './supabase-admin';
import { mediaDeletesAt, TIER_LIST } from './tiers';

const BUCKET = 'submissions';
const DAY = 24 * 60 * 60 * 1000;

export const isBackupConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function storagePath(mediaUrl: string): string | null {
  const i = mediaUrl.indexOf(`/storage/v1/object/public/${BUCKET}/`);
  if (i < 0) return null;
  return decodeURIComponent(mediaUrl.slice(i + `/storage/v1/object/public/${BUCKET}/`.length));
}

const backupPath = (path: string) => `${BUCKET}/${path}`;

/** Copy not-yet-backed-up captures to Blob until the time budget runs out. */
export async function runBackup(budgetMs: number): Promise<{ copied: number; failed: number; remaining: boolean }> {
  const sb = getSupabaseAdmin();
  if (!sb || !isBackupConfigured) throw new Error('backup not configured');
  const storage = sb.storage.from(BUCKET);
  const deadline = Date.now() + budgetMs;
  let copied = 0;
  let failed = 0;
  const skip = new Set<string>(); // failed this run: don't spin on them

  while (Date.now() < deadline) {
    const { data, error } = await sb
      .from('submissions')
      .select('id, media_url')
      .is('backed_up_at', null)
      .order('created_at', { ascending: true })
      .limit(40);
    if (error) throw new Error('could not list submissions');
    const rows = ((data ?? []) as { id: string; media_url: string }[]).filter((r) => !skip.has(r.id));
    if (rows.length === 0) return { copied, failed, remaining: false };

    // a few at a time: videos are up to 30 MB each
    for (let i = 0; i < rows.length && Date.now() < deadline; i += 4) {
      await Promise.all(
        rows.slice(i, i + 4).map(async (row) => {
          const path = storagePath(row.media_url);
          try {
            if (!path) throw new Error('not a storage url');
            const { data: file, error: dlErr } = await storage.download(path);
            if (dlErr || !file) throw new Error('download failed');
            await put(backupPath(path), file, {
              access: 'private',
              contentType: file.type || undefined,
              allowOverwrite: true,
              addRandomSuffix: false,
              multipart: file.size > 8 * 1024 * 1024,
            });
            await sb.from('submissions').update({ backed_up_at: new Date().toISOString() }).eq('id', row.id);
            copied++;
          } catch {
            skip.add(row.id);
            failed++;
          }
        }),
      );
    }
  }
  return { copied, failed, remaining: true };
}

/** Remove an event's backup copies. True when nothing is left. */
export async function deleteEventBackup(eventId: string): Promise<boolean> {
  if (!isBackupConfigured) return true;
  let cursor: string | undefined;
  for (let guard = 0; guard < 200; guard++) {
    const page = await list({ prefix: backupPath(`${eventId}/`), limit: 1000, cursor });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    if (!page.hasMore) return true;
    cursor = page.cursor;
  }
  return false;
}

/** Permanently delete every event whose retention has passed. */
export async function runPurge(now = Date.now()): Promise<{ purged: string[]; failed: string[] }> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('supabase not configured');
  // nothing can be due before the shortest retention, so narrow the scan
  const minDays = Math.min(...TIER_LIST.map((t) => t.features.retentionDays));
  const cutoff = new Date(now - minDays * DAY).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('events')
    .select('id, slug, tier, wedding_date')
    .is('purged_at', null)
    .lte('wedding_date', cutoff)
    .limit(200);
  if (error) throw new Error('could not list events');

  const purged: string[] = [];
  const failed: string[] = [];
  for (const ev of (data ?? []) as { id: string; slug: string; tier: string; wedding_date: string }[]) {
    const due = mediaDeletesAt(ev);
    if (!due || due.getTime() > now) continue;
    try {
      if (!(await deleteEventMedia(ev.id))) throw new Error('storage');
      if (!(await deleteEventBackup(ev.id))) throw new Error('backup');
      // comments go with their submissions (on delete cascade)
      const { error: pErr } = await sb.from('pending_uploads').delete().eq('event_id', ev.id);
      const { error: sErr } = await sb.from('submissions').delete().eq('event_id', ev.id);
      if (pErr || sErr) throw new Error('rows');
      const { error: uErr } = await sb
        .from('events')
        .update({ purged_at: new Date(now).toISOString() })
        .eq('id', ev.id);
      if (uErr) throw new Error('stamp');
      purged.push(ev.slug);
    } catch {
      failed.push(ev.slug);
    }
  }
  return { purged, failed };
}
