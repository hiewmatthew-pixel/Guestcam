'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { labelForMediaType, type SubmissionRow } from '@/lib/supabase';
import { listFavorites, toggleFavorite } from '@/lib/favorites';
import { shareMedia, type ShareResult } from '@/lib/share';
import CommentThread from '@/components/CommentThread';
import { extensionFor } from '@/lib/media';
import { filterLabel } from '@/lib/filters';

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

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), audio[controls], video[controls], [tabindex]:not([tabindex="-1"])';

/** "photo by Aunt May" / "voice note by an anonymous guest" */
function describe(it: SubmissionRow): string {
  return `${labelFor(it.media_type)} by ${it.guest_name ?? 'an anonymous guest'}`;
}

export default function Gallery({
  items,
  eventId,
  coupleNames,
  canModerate = false,
  onSetApproved,
  showComments = true,
}: Props) {
  const ev = eventId ?? items[0]?.event_id ?? '';

  // the open item is tracked by id so realtime updates (approve/hide,
  // new rows) flow into the lightbox; the snapshot keeps it on screen if
  // it drops out of the current tab (e.g. un-favourited on that tab).
  const [openId, setOpenId] = useState<string | null>(null);
  const [openSnapshot, setOpenSnapshot] = useState<SubmissionRow | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    if (ev) setFavs(listFavorites(ev));
  }, [ev]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

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

  const openIdx = openId ? filtered.findIndex((it) => it.id === openId) : -1;
  const open: SubmissionRow | null = openId
    ? openIdx >= 0
      ? filtered[openIdx]
      : visibleItems.find((it) => it.id === openId) ?? openSnapshot
    : null;

  const openItem = useCallback((it: SubmissionRow) => {
    setOpenId(it.id);
    setOpenSnapshot(it);
  }, []);
  const closeLightbox = useCallback(() => {
    setOpenId(null);
    setOpenSnapshot(null);
  }, []);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (openIdx < 0 || filtered.length < 2) return;
      const next = filtered[(openIdx + dir + filtered.length) % filtered.length];
      setOpenId(next.id);
      setOpenSnapshot(next);
    },
    [openIdx, filtered],
  );

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800) as unknown as number;
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

  async function onDownload(it: SubmissionRow) {
    const ext = extensionFor(it);
    const who = it.guest_name ? `-${it.guest_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : '';
    const name = `glance-${it.media_type}${who}.${ext}`;
    try {
      // fetch as blob so it saves rather than navigating (cross-origin URL)
      const res = await fetch(it.media_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      flash('saved');
    } catch {
      // fallback: open in a new tab for manual save (e.g. CORS blocked)
      window.open(it.media_url, '_blank', 'noopener,noreferrer');
    }
  }

  // --- empty state ----------------------------------------------------
  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-serif italic text-2xl text-ink/70">no moments yet</p>
        <p className="mt-2 text-sm text-ink/70">
          the gallery fills as guests capture the night
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-cream/90 backdrop-blur supports-[backdrop-filter]:bg-cream/75 border-b border-ink/10">
        <div
          role="group"
          aria-label="show"
          className="px-3 py-1 flex gap-1 overflow-x-auto no-scrollbar"
        >
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
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={active}
                  className={[
                    'shrink-0 min-h-11 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest transition-colors',
                    active
                      ? isPendingTab
                        ? 'bg-gold text-ink'
                        : 'bg-ink text-cream'
                      : isPendingTab && n > 0
                        ? 'bg-gold/10 text-ink border border-gold'
                        : 'bg-transparent text-ink/70 hover:text-ink',
                  ].join(' ')}
                >
                  {isFavTab && <span aria-hidden className="mr-1">♥</span>}
                  {isPendingTab && <span aria-hidden className="mr-1">⚑</span>}
                  {TAB_LABELS[f]}
                  <span
                    className={
                      active
                        ? isPendingTab
                          ? 'ml-1.5 text-ink/75'
                          : 'ml-1.5 text-cream/75'
                        : 'ml-1.5 text-ink/70'
                    }
                  >
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
          <p className="font-serif italic text-2xl text-ink/70">
            {filter === 'favourites' ? 'no favourites yet' : `no ${TAB_LABELS[filter]} yet`}
          </p>
          <p className="mt-2 text-sm text-ink/70">
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
              onOpen={() => openItem(it)}
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

      {open && (
        <Lightbox
          item={open}
          index={openIdx}
          total={filtered.length}
          onClose={closeLightbox}
          onStep={step}
          favourited={favs.has(open.id)}
          onFavourite={() => onToggleFav(open)}
          onShare={() => onShare(open)}
          onDownload={() => onDownload(open)}
          eventId={ev}
          showComments={showComments}
        />
      )}

      {/* Toast — a polite live region that stays mounted so screen
          readers announce each message */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 inset-x-0 z-[60] flex justify-center pointer-events-none"
      >
        {toast && (
          <div className="bg-ink text-cream text-[10px] uppercase tracking-widest px-4 py-2 rounded-full shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </>
  );
}

// --- Lightbox -------------------------------------------------------------

function Lightbox({
  item,
  index,
  total,
  onClose,
  onStep,
  favourited,
  onFavourite,
  onShare,
  onDownload,
  eventId,
  showComments,
}: {
  item: SubmissionRow;
  index: number;
  total: number;
  onClose: () => void;
  onStep: (dir: 1 | -1) => void;
  favourited: boolean;
  onFavourite: () => void;
  onShare: () => void;
  onDownload: () => void;
  eventId: string;
  showComments: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const canStep = index >= 0 && total > 1;
  const filter = filterLabel(item.filter_name);

  // focus moves in on open and back to the opener on close; page scroll
  // is locked behind the dialog
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  // keyboard: Escape closes, ←/→ step, Tab is trapped inside the dialog
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!typing && canStep && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        onStep(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const root = dialogRef.current;
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => n.getClientRects().length > 0,
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onStep, canStep]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !canStep) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // a deliberate horizontal swipe, not a vertical scroll
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onStep(dx < 0 ? 1 : -1);
    }
  }

  const desc = describe(item);
  const mediaClass = 'mx-auto max-w-full w-auto h-auto max-h-[calc(100dvh-170px)]';
  const roundBtn =
    'fixed z-[55] w-11 h-11 rounded-full bg-ink/70 border border-cream/20 text-cream text-xl leading-none grid place-items-center';

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-ink/95 overflow-y-auto overscroll-contain"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
    >
      {/* always-visible close, clear of the notch */}
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="close"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
        className={`${roundBtn} right-3`}
      >
        <span aria-hidden>×</span>
      </button>

      {canStep && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStep(-1);
            }}
            aria-label="previous capture"
            className={`${roundBtn} left-2 top-1/2 -translate-y-1/2`}
          >
            <span aria-hidden>‹</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStep(1);
            }}
            aria-label="next capture"
            className={`${roundBtn} right-2 top-1/2 -translate-y-1/2`}
          >
            <span aria-hidden>›</span>
          </button>
        </>
      )}

      <div className="min-h-full grid place-items-center px-4 pt-16 pb-safe-4">
        <div
          className={[
            'max-w-5xl w-full grid grid-cols-[minmax(0,1fr)] gap-6 md:gap-8 items-start',
            showComments && eventId ? 'md:grid-cols-[minmax(0,1fr)_320px]' : '',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {item.media_type === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.id}
                src={item.media_url}
                alt={desc}
                className={`${mediaClass} object-contain`}
              />
            ) : item.media_type === 'boomerang' ? (
              <video
                key={item.id}
                src={item.media_url}
                aria-label={desc}
                className={mediaClass}
                autoPlay
                playsInline
                loop
                muted
              />
            ) : item.media_type === 'voice' ? (
              <div className="bg-warm-gray-light/20 border border-cream/15 rounded-sm p-8 text-center">
                <div
                  aria-hidden
                  className="w-20 h-20 mx-auto rounded-full bg-gold/90 grid place-items-center"
                >
                  <span className="text-ink text-3xl leading-none">♪</span>
                </div>
                <p className="mt-5 font-serif italic text-4xl text-cream">
                  {item.guest_name ?? 'anonymous'}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-cream/65">
                  a voice note
                </p>
                <audio
                  key={item.id}
                  src={item.media_url}
                  controls
                  autoPlay
                  aria-label={desc}
                  className="mt-8 w-full"
                />
              </div>
            ) : (
              <video
                key={item.id}
                src={item.media_url}
                aria-label={desc}
                className={mediaClass}
                controls
                autoPlay
                playsInline
              />
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="min-w-0 text-cream/80 text-xs tracking-widest uppercase">
                <span
                  id="lightbox-title"
                  className="font-serif italic normal-case tracking-normal text-base text-cream"
                >
                  {item.guest_name ?? 'anonymous'}
                </span>
                {filter && <span className="text-cream/65"> · {filter}</span>}
                <span className="text-cream/65"> · {labelFor(item.media_type)}</span>
                {canStep && (
                  <span className="text-cream/65">
                    {' '}
                    · {index + 1} / {total}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  onClick={onFavourite}
                  active={favourited}
                  pressed={favourited}
                  label="favourite"
                  glyph={favourited ? '♥' : '♡'}
                />
                <ActionButton onClick={onShare} label="share" glyph="↗" />
                <ActionButton onClick={onDownload} label="download" glyph="↓" />
              </div>
            </div>
          </div>
          {eventId && showComments && (
            <aside className="bg-cream/5 border border-cream/10 rounded-sm p-4 md:max-h-[80vh] md:overflow-y-auto">
              <CommentThread eventId={eventId} submissionId={item.id} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Tiles ----------------------------------------------------------------

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
      {/* the button is named by its content: "open <type> by <guest>" */}
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative">
          {item.media_type === 'photo' ? (
            // decorative here — the button's text already names the capture
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.media_url} alt="" className="block w-full h-auto" loading="lazy" />
          ) : item.media_type === 'boomerang' || item.media_type === 'video' ? (
            <TileVideo src={item.media_url} loopInView={item.media_type === 'boomerang'} />
          ) : (
            <div className="aspect-[3/2] bg-gradient-to-br from-warm-gray-light to-warm-gray-light/60 grid place-items-center px-4 py-6">
              <div className="text-center" aria-hidden>
                <div className="w-14 h-14 mx-auto rounded-full bg-gold/90 grid place-items-center">
                  <span className="text-ink text-2xl leading-none">♪</span>
                </div>
                <p className="mt-3 font-serif italic text-xl text-ink leading-snug">
                  {item.guest_name ?? 'anonymous'}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-ink/70">
                  voice note
                </p>
              </div>
            </div>
          )}
          {/* media-type tag (skip on voice — the tile is already self-identifying) */}
          {item.media_type !== 'photo' && item.media_type !== 'voice' && (
            <span
              aria-hidden
              className="absolute top-2 left-2 text-[9px] uppercase tracking-widest text-cream bg-ink/75 px-1.5 py-0.5 rounded-sm"
            >
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
            <span className="sr-only">open {labelFor(item.media_type)} by </span>
            <span aria-hidden className="text-ink/70">
              —{' '}
            </span>
            {item.guest_name ?? 'anonymous'}
          </span>
        </div>
      </button>

      {/* tile actions — 44px hit areas around 32px visual chips */}
      <div className="absolute bottom-7 right-0.5 flex">
        {canModerate && isPending && onApprove && (
          <TileIcon onClick={onApprove} label={`approve ${describe(item)}`} glyph="✓" active />
        )}
        {canModerate && !isPending && onHide && (
          <TileIcon onClick={onHide} label={`hide ${describe(item)}`} glyph="⤫" />
        )}
        <TileIcon
          onClick={onFavourite}
          active={favourited}
          pressed={favourited}
          label={`favourite ${describe(item)}`}
          glyph={favourited ? '♥' : '♡'}
        />
        <TileIcon onClick={onShare} label={`share ${describe(item)}`} glyph="↗" />
      </div>
    </div>
  );
}

/**
 * Boomerang / film tile. Only metadata is fetched up front; boomerangs
 * loop (muted) while at least half on screen and pause when scrolled
 * away; films preview on hover. Saves a lot of bandwidth on a long
 * gallery over venue wifi.
 */
function TileVideo({ src, loopInView }: { src: string; loopInView: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === 'undefined') return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && loopInView && !reduceMotion) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [loopInView]);

  // a tiny media-fragment offset makes iOS paint the first frame with
  // preload="metadata" (http(s) only — not data:/blob: URLs)
  const withFrame = /^https?:/i.test(src) && !src.includes('#') ? `${src}#t=0.001` : src;

  return (
    <video
      ref={ref}
      src={withFrame}
      className="block w-full h-auto"
      muted
      playsInline
      loop
      preload="metadata"
      aria-hidden
      tabIndex={-1}
      onMouseEnter={loopInView ? undefined : (e) => e.currentTarget.play().catch(() => {})}
      onMouseLeave={loopInView ? undefined : (e) => e.currentTarget.pause()}
    />
  );
}

function TileIcon({
  onClick,
  active,
  pressed,
  label,
  glyph,
}: {
  onClick: () => void;
  active?: boolean;
  pressed?: boolean;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      className="w-11 h-11 grid place-items-center rounded-full"
    >
      <span
        aria-hidden
        className={[
          'w-8 h-8 grid place-items-center rounded-full border text-base transition-colors',
          active
            ? 'bg-gold text-ink border-gold'
            : 'bg-cream/90 text-ink border-ink/15 hover:bg-cream',
        ].join(' ')}
      >
        {glyph}
      </span>
    </button>
  );
}

function ActionButton({
  onClick,
  active,
  pressed,
  label,
  glyph,
}: {
  onClick: () => void;
  active?: boolean;
  pressed?: boolean;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={[
        'min-h-11 flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-full border transition-colors',
        active
          ? 'bg-gold text-ink border-gold'
          : 'bg-transparent text-cream/85 border-cream/25 hover:text-cream',
      ].join(' ')}
    >
      <span aria-hidden className="text-sm leading-none">
        {glyph}
      </span>
      <span>{label}</span>
    </button>
  );
}

const labelFor = labelForMediaType;
