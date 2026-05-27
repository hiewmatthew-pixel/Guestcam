'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addComment,
  listCommentsFor,
  readStoredGuestName,
  storeGuestName,
  subscribeToComments,
} from '@/lib/comments';
import type { CommentRow } from '@/lib/supabase';

type Props = {
  eventId: string;
  submissionId: string;
};

export default function CommentThread({ eventId, submissionId }: Props) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(readStoredGuestName());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCommentsFor(eventId, submissionId)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    const unsub = subscribeToComments(eventId, submissionId, (row) => {
      setItems((cur) => (cur.some((c) => c.id === row.id) ? cur : [...cur, row]));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [eventId, submissionId]);

  // scroll to bottom when new comments arrive
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!body.trim()) return;
    setPosting(true);
    try {
      const clean = name.trim().slice(0, 60) || null;
      if (clean) storeGuestName(clean);
      const inserted = await addComment({
        event_id: eventId,
        submission_id: submissionId,
        guest_name: clean,
        body,
      });
      // optimistic-friendly: append if realtime hasn't echoed yet
      setItems((cur) =>
        cur.some((c) => c.id === inserted.id) ? cur : [...cur, inserted],
      );
      setBody('');
    } catch (e: any) {
      setErr(e?.message || 'Could not post your comment.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="text-cream">
      <p className="text-[10px] uppercase tracking-[0.3em] text-cream/55 mb-3">
        comments {items.length > 0 && <span className="text-cream/40">· {items.length}</span>}
      </p>

      <div
        ref={scrollerRef}
        className="max-h-56 md:max-h-72 overflow-y-auto pr-1 space-y-2"
      >
        {loading && (
          <p className="text-[11px] text-cream/45 italic">loading…</p>
        )}
        {!loading && items.length === 0 && (
          <p className="text-[11px] text-cream/45 italic">
            be the first to leave a note.
          </p>
        )}
        {items.map((c) => (
          <div
            key={c.id}
            className="text-sm leading-relaxed bg-cream/5 border border-cream/10 rounded-sm px-3 py-2"
          >
            <p className="font-serif italic text-cream/95">
              {c.guest_name || 'anonymous'}
            </p>
            <p className="text-cream/85 mt-0.5 whitespace-pre-wrap break-words">
              {c.body}
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="your name (optional)"
          className="w-full bg-cream/5 border border-cream/15 focus:border-gold outline-none text-cream placeholder:text-cream/35 text-sm px-3 py-2 rounded-sm"
        />
        <div className="flex items-stretch gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={280}
            placeholder="leave a short note…"
            className="flex-1 bg-cream/5 border border-cream/15 focus:border-gold outline-none text-cream placeholder:text-cream/35 text-sm px-3 py-2 rounded-sm"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="bg-gold text-ink px-4 text-[10px] uppercase tracking-widest rounded-sm disabled:opacity-50"
          >
            {posting ? '…' : 'post'}
          </button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <p className="text-[10px] uppercase tracking-widest text-cream/35">
          {body.length}/280
        </p>
      </form>
    </div>
  );
}
