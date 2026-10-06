// Keeps a submissions list fresh for one event. Shared by the guest
// gallery, the TV display, the couple's portal and the admin page.
//
// `load` returns the full list for whoever is looking (approved-only for
// guests via RLS; everything for the couple/admin via a server action).
// Rather than patching rows in place, every signal triggers a debounced
// reload, because anon realtime never sees pending or newly hidden rows:
//   - a broadcast the server sends after each new capture
//   - a broadcast the server sends after approve/hide
//   - an optional poll (portal/admin, so pending rows show up)
//   - the tab becoming visible again

import { getSupabase, isTrustedMediaUrl, moderationChannelName, type SubmissionRow } from './supabase';

export function watchSubmissions(opts: {
  eventId: string;
  load: () => Promise<SubmissionRow[] | null>;
  onRows: (rows: SubmissionRow[]) => void;
  onError?: (e: unknown) => void;
  pollMs?: number;
}): () => void {
  const sb = getSupabase();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight = false;
  let again = false;

  async function reload() {
    if (stopped) return;
    if (inflight) {
      again = true;
      return;
    }
    inflight = true;
    try {
      const rows = await opts.load();
      if (!stopped && rows) opts.onRows(rows.filter(isTrustedMediaUrl));
    } catch (e) {
      if (!stopped) opts.onError?.(e);
    } finally {
      inflight = false;
      if (again && !stopped) {
        again = false;
        reload();
      }
    }
  }

  function soon() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(reload, 300);
  }

  reload();

  // Anon can't subscribe to table changes (it has no table access), so the
  // server broadcasts after every new capture and every moderation change.
  const channels = sb
    ? [sb.channel(moderationChannelName(opts.eventId)).on('broadcast', { event: 'changed' }, soon).subscribe()]
    : [];

  const poll = opts.pollMs ? setInterval(reload, opts.pollMs) : null;
  const onVisible = () => {
    if (document.visibilityState === 'visible') soon();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (poll) clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisible);
    for (const ch of channels) sb?.removeChannel(ch);
  };
}
