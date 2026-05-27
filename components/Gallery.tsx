'use client';

import { useEffect, useMemo, useState } from 'react';
import { labelForMediaType, type SubmissionRow } from '@/lib/supabase';
import { isFavorite, listFavorites, toggleFavorite } from '@/lib/favorites';
import { shareMedia, type ShareResult } from '@/lib/share';
import CommentThread from '@/components/CommentThread';

type Props = {
  items: SubmissionRow[];
  // when omitted, falls back to the first item's event_id (legacy callers)
  eventId?: string;
  coupleNames?: string;
  // when true, the viewer can approve / hide items. Pending items are
  // visible only to these viewers; everyone else's gallery filters them
  // out at the data layer.
  canModerate?: boolean;
  onSetApproved?: (submissionId: string, approved: boolean) => Promise<void> | void;
  // controls per-photo comment thread in the lightbox; defaults true
  // so legacy callers keep their old behaviour.
  showComments?: boolean;
};

type Filter = 'all' | 'photo' | 'video' | 'boomerang' | 'voice' | 'favourites' | 'pending';

const TAB_LABELS: Record<Filter, string> = {
  all: 'all',
  photo: 'photos',
  video: 'films',
  boomerang: 'boomerangs',
  voice: 'voice notes',
  favourites: 'favourites',
  pending: 'pending',
};

export default function Gallery({
  items,
  eventId,
  coupleNames,
  canModerate = false,
  onSetApproved,
  showComments = true,
}: Props) {
  const ev = eventId ?? items[0]?.event_id ?? '';

  const [open, setOpen] = useState<SubmissionRow | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (ev) setFavs(listFavorites(ev));
  }, [ev]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // viewers without moderation power never see unapproved items in any tab
  const visibleItems = useMemo(
    () => (canModerate ? items : items.filter((it) => it.approved)),
    [items, canModerate],
  );

  const counts = useMemo(() => {
    const c = {
      all: 0,
      photo: 0,
      video: 0,
      boomerang: 0,
      voice: 0,
      favourites: 0,
      pending: 0,
    };
    for (const it of visibleItems) {
      // favourites are counted regardless of approval — a moderator who
      // hearts a pending capture shouldn't see the count vanish.
      if (favs.has(it.id)) c.favourites++;
      if (it.approved) {
        c.all++;
        if (it.media_type === 'photo') c.photo++;
        else if (it.media_type === 'video') c.video++;
        else if (it.media_type === 'boomerang') c.boomerang++;
        else if (it.media_type === 'voice') c.voice++;
      } else if (canModerate) {
        c.pending++;
      }
    }
    return c;
  }, [visibleItems, favs, canModerate]);

  const filtered = useMemo(() => {
    if (filter === 'pending') return visibleItems.filter((it) => !it.approved);
    // Favourites tab shows BOTH approved and pending favourites when the
    // viewer can moderate, otherwise approved-only.
    if (filter === 'favourites') {
      return visibleItems.filter(
        (it) => favs.has(it.id) && (canModerate || it.approved),
      );
    }
    const approved = visibleItems.filter((it) => it.approved);
    if (filter === 'all') return approved;
    return approved.filter((it) => it.media_type === filter);
  }, [visibleItems, filter, favs, canModerate]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  function onToggleFav(it: SubmissionRow) {
    if (!ev) return;
    const added = toggleFavorite(ev, it.id);
    setFavs((cur) => {
      const next = new Set(cur);
      if (added) next.add(it.id);
      else next.delete(it.id);
      return next;
    });
    flash(added ? 'saved to favourites' : 'removed from favourites');
  }

  async function onModerate(it: SubmissionRow, approve: boolean) {
    if (!onSetApproved) return;
    try {
      await onSetApproved(it.id, approve);
      flash(approve ? 'approved' : 'hidden');
    } catch {
      flash('could not update');
    }
  }

  async function onShare(it: SubmissionRow) {
    const who = it.guest_name ? `by ${it.guest_name}` : '';
    const title = coupleNames ? `${coupleNames} — guest cam ${who}`.trim() : `guest cam ${who}`.trim();
    const r: ShareResult = await shareMedia({
      title,
      text: title,
      url: it.media_url,
    });
    if (r === 'shared') flash('shared');
    else if (r === 'copied') flash('link copied');
    else if (r === 'failed') flash('could not share');
  }

  // --- empty state ----------------------------------------------------
  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-serif italic text-2xl text-ink/60">no moments yet</p>
        <p className="mt-2 text-sm text-ink/50">
          the gallery fills as guests capture the night
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-cream/90 backdrop-blur supports-[backdrop-filter]:bg-cream/75 border-b border-ink/10">
        <div className="px-3 py-2 flex gap-1 overflow-x-auto no-scrollbar">
          {(Object.keys(TAB_LABELS) as Filter[])
            .filter((f) => f !== 'pending' || canModerate)
            .map((f) => {
              const active = filter === f;
              const n = counts[f];
              const isFavTab = f === 'favourites';
              const isPendingTab = f === 'pending';
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={[
                    'shrink-0 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest transition-colors',
                    active
                      ? isPendingTab
                        ? 'bg-gold text-ink'
                        : 'bg-ink text-cream'
                      : isPendingTab && n > 0
                        ? 'bg-gold/10 text-ink border border-gold'
                        : 'bg-transparent text-ink/65 hover:text-ink',
                  ].join(' ')}
                >
                  {isFavTab && <span className="mr-1">♥</span>}
                  {isPendingTab && <span className="mr-1">⚑</span>}
                  {TAB_LABELS[f]}
                  <span className={active ? 'ml-1.5 text-cream/70' : 'ml-1.5 text-ink/40'}>
                    {n}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Empty state for the active filter */}
      {filtered.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-serif italic text-2xl text-ink/60">
            {filter === 'favourites' ? 'no favourites yet' : `no ${TAB_LABELS[filter]} yet`}
          </p>
          <p className="mt-2 text-sm text-ink/50">
            {filter === 'favourites'
              ? 'tap the heart on any capture to save it here'
              : 'check back as the night unfolds'}
          </p>
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 md:columns-4 gap-3 px-3 pt-3">
          {filtered.map((it) => (
            <Tile
              key={it.id}
              item={it}
              onOpen={() => setOpen(it)}
              favourited={favs.has(it.id)}
              onFavourite={() => onToggleFav(it)}
              onShare={() => onShare(it)}
              canModerate={canModerate}
              onApprove={() => onModerate(it, true)}
              onHide={() => onModerate(it, false)}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/95 grid place-items-center p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className={[
              'max-w-5xl w-full grid gap-6 md:gap-8 items-start',
              showComments && ev
                ? 'md:grid-cols-[minmax(0,1fr)_320px]'
                : '',
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
            {open.media_type === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.media_url} alt="" className="w-full h-auto" />
            ) : open.media_type === 'boomerang' ? (
              <video
                src={open.media_url}
                className="w-full h-auto"
                autoPlay
                playsInline
                loop
                muted
              />
            ) : open.media_type === 'voice' ? (
              <div className="bg-warm-gray-light/20 border border-cream/15 rounded-sm p-8 text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-gold/90 grid place-items-center">
                  <span className="text-ink text-3xl leading-none">♪</span>
                </div>
                <p className="mt-5 font-serif italic text-4xl text-cream">
                  {open.guest_name ?? 'anonymous'}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-cream/55">
                  a voice note
                </p>
                <audio src={open.media_url} controls autoPlay className="mt-8 w-full" />
              </div>
            ) : (
              <video src={open.media_url} className="w-full h-auto" controls autoPlay playsInline />
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-cream/80 text-xs tracking-widest uppercase">
                <span className="font-serif italic normal-case text-base text-cream">
                  {open.guest_name ?? 'anonymous'}
                </span>
                <span className="text-cream/50"> · {open.filter_name}</span>
                <span className="text-cream/50"> · {labelFor(open.media_type)}</span>
              </div>
              <div className="flex items-center gap-2">
                <ActionButton
                  onClick={() => onToggleFav(open)}
                  active={favs.has(open.id)}
                  label="favourite"
                  glyph={favs.has(open.id) ? '♥' : '♡'}
                />
                <ActionButton onClick={() => onShare(open)} label="share" glyph="↗" />
                <button
                  onClick={() => setOpen(null)}
                  className="text-[10px] uppercase tracking-widest text-cream/60 hover:text-cream px-2 py-1"
                >
                  close
                </button>
              </div>
            </div>
            </div>
            {ev && showComments && (
              <aside className="bg-cream/5 border border-cream/10 rounded-sm p-4 md:max-h-[80vh] md:overflow-y-auto">
                <CommentThread eventId={ev} submissionId={open.id} />
              </aside>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 inset-x-0 z-[60] flex justify-center pointer-events-none">
          <div className="bg-ink text-cream text-[10px] uppercase tracking-widest px-4 py-2 rounded-full shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </>
  );
}

function Tile({
  item,
  onOpen,
  favourited,
  onFavourite,
  onShare,
  canModerate = false,
  onApprove,
  onHide,
}: {
  item: SubmissionRow;
  onOpen: () => void;
  favourited: boolean;
  onFavourite: () => void;
  onShare: () => void;
  canModerate?: boolean;
  onApprove?: () => void;
  onHide?: () => void;
}) {
  const isPending = !item.approved;
  return (
    <div className="mb-3 group relative overflow-hidden rounded-sm bg-warm-gray-light/40 break-inside-avoid">
      <button onClick={onOpen} className="block w-full" aria-label="open">
        <div className="relative">
          {item.media_type === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.media_url}
              alt={item.guest_name ?? 'guest capture'}
              className="block w-full h-auto"
              loading="lazy"
            />
          ) : item.media_type === 'boomerang' ? (
            <video
              src={item.media_url}
              className="block w-full h-auto"
              muted
              playsInline
              autoPlay
              loop
            />
          ) : item.media_type === 'voice' ? (
            <div className="aspect-[3/2] bg-gradient-to-br from-warm-gray-light to-warm-gray-light/60 grid place-items-center px-4 py-6">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-gold/90 grid place-items-center">
                  <span className="text-ink text-2xl leading-none">♪</span>
                </div>
                <p className="mt-3 font-serif italic text-xl text-ink leading-snug">
                  {item.guest_name ?? 'anonymous'}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-ink/55">
                  voice note
                </p>
              </div>
            </div>
          ) : (
            <video
              src={item.media_url}
              className="block w-full h-auto"
              muted
              playsInline
              loop
              onMouseEnter={(e) =>
                (e.currentTarget as HTMLVideoElement).play().catch(() => {})
              }
              onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
            />
          )}
          {/* media-type tag (skip on voice — the tile is already self-identifying) */}
          {item.media_type !== 'photo' && item.media_type !== 'voice' && (
            <span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest text-cream bg-ink/65 px-1.5 py-0.5 rounded-sm">
              {labelFor(item.media_type)}
            </span>
          )}
          {isPending && (
            <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest text-ink bg-gold px-1.5 py-0.5 rounded-sm">
              pending
            </span>
          )}
        </div>

        {/* attribution bar (always visible — that was the request) */}
        <div className="flex items-center justify-between px-2 py-2 gap-2">
          <span className="text-[11px] tracking-wider text-ink/75 truncate">
            <span className="text-ink/40">— </span>
            {item.guest_name ?? 'anonymous'}
          </span>
        </div>
      </button>

      {/* tile actions */}
      <div className="absolute bottom-9 right-2 flex gap-1 opacity-90">
        {canModerate && isPending && onApprove && (
          <TileIcon onClick={onApprove} label="approve" glyph="✓" active />
        )}
        {canModerate && !isPending && onHide && (
          <TileIcon onClick={onHide} label="hide" glyph="⤫" />
        )}
        <TileIcon
          onClick={onFavourite}
          active={favourited}
          label={favourited ? 'remove favourite' : 'favourite'}
          glyph={favourited ? '♥' : '♡'}
        />
        <TileIcon onClick={onShare} label="share" glyph="↗" />
      </div>
    </div>
  );
}

function TileIcon({
  onClick,
  active,
  label,
  glyph,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      className={[
        'w-8 h-8 grid place-items-center rounded-full border text-base transition-colors',
        active
          ? 'bg-gold text-ink border-gold'
          : 'bg-cream/90 text-ink border-ink/15 hover:bg-cream',
      ].join(' ')}
    >
      {glyph}
    </button>
  );
}

function ActionButton({
  onClick,
  active,
  label,
  glyph,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors',
        active
          ? 'bg-gold text-ink border-gold'
          : 'bg-transparent text-cream/85 border-cream/25 hover:text-cream',
      ].join(' ')}
    >
      <span className="text-sm leading-none">{glyph}</span>
      <span>{label}</span>
    </button>
  );
}

const labelFor = labelForMediaType;
