'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SubmissionRow } from '@/lib/supabase';
import { isFavorite, listFavorites, toggleFavorite } from '@/lib/favorites';
import { shareMedia, type ShareResult } from '@/lib/share';

type Props = {
  items: SubmissionRow[];
  // when omitted, falls back to the first item's event_id (legacy callers)
  eventId?: string;
  coupleNames?: string;
};

type Filter = 'all' | 'photo' | 'video' | 'boomerang' | 'favourites';

const TAB_LABELS: Record<Filter, string> = {
  all: 'all',
  photo: 'photos',
  video: 'films',
  boomerang: 'boomerangs',
  favourites: 'favourites',
};

export default function Gallery({ items, eventId, coupleNames }: Props) {
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

  const counts = useMemo(() => {
    const c = { all: items.length, photo: 0, video: 0, boomerang: 0, favourites: 0 };
    for (const it of items) {
      if (it.media_type === 'photo') c.photo++;
      else if (it.media_type === 'video') c.video++;
      else if (it.media_type === 'boomerang') c.boomerang++;
      if (favs.has(it.id)) c.favourites++;
    }
    return c;
  }, [items, favs]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'favourites') return items.filter((it) => favs.has(it.id));
    return items.filter((it) => it.media_type === filter);
  }, [items, filter, favs]);

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
          {(Object.keys(TAB_LABELS) as Filter[]).map((f) => {
            const active = filter === f;
            const n = counts[f];
            const isFavTab = f === 'favourites';
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={[
                  'shrink-0 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest transition-colors',
                  active
                    ? 'bg-ink text-cream'
                    : 'bg-transparent text-ink/65 hover:text-ink',
                ].join(' ')}
              >
                {isFavTab && <span className="mr-1">♥</span>}
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
            className="max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
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
}: {
  item: SubmissionRow;
  onOpen: () => void;
  favourited: boolean;
  onFavourite: () => void;
  onShare: () => void;
}) {
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
          {/* media-type tag */}
          {item.media_type !== 'photo' && (
            <span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest text-cream bg-ink/65 px-1.5 py-0.5 rounded-sm">
              {labelFor(item.media_type)}
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

      {/* tile actions: heart + share */}
      <div className="absolute bottom-9 right-2 flex gap-1 opacity-90">
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

function labelFor(t: SubmissionRow['media_type']) {
  if (t === 'photo') return 'photo';
  if (t === 'boomerang') return 'boomerang';
  return 'film';
}
