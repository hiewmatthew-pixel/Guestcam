'use client';

// Google Analytics for the PUBLIC marketing pages only (home, pricing,
// terms, privacy). Never on guest cameras, galleries, couple portals or
// the admin. Opt-in: gtag.js isn't loaded at all until the visitor
// accepts, and the choice is remembered on their device. "Cookie
// settings" in the footer reopens the choice.

import Script from 'next/script';
import { useEffect, useState } from 'react';

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-4NZ7KHEYMG';
const KEY = 'ggc:analytics-consent';
const OPEN_EVENT = 'ggc:open-consent';
type Choice = 'granted' | 'denied' | null;

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

/** Drop GA's cookies when a visitor withdraws consent. */
function clearGaCookies() {
  const host = location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const name of document.cookie.split(';').map((c) => c.split('=')[0].trim())) {
    if (!/^_ga/.test(name)) continue;
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
    }
  }
}

export default function Analytics() {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const c = readChoice();
    setChoice(c);
    setAsking(c === null);
    setReady(true);
    const reopen = () => setAsking(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  function decide(c: 'granted' | 'denied') {
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
    if (c === 'denied' && choice === 'granted') {
      clearGaCookies();
      // the loaded script stops on the next page load; reload so it's gone now
      location.reload();
      return;
    }
    setChoice(c);
    setAsking(false);
  }

  if (!ready) return null;
  return (
    <>
      {choice === 'granted' && GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}
      {asking && (
        <div
          role="region"
          aria-label="analytics choice"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-ink/10 bg-cream/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <p className="text-xs leading-relaxed text-ink/80">
              May we use Google Analytics cookies to see which pages are helpful? It’s off unless you
              agree, and never runs on wedding cameras or galleries.{' '}
              <a href="/privacy#analytics" className="underline underline-offset-2">
                Learn more
              </a>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decide('denied')}
                className="min-h-11 rounded-sm border border-ink/30 px-4 text-[10px] uppercase tracking-widest text-ink"
              >
                decline
              </button>
              <button
                type="button"
                onClick={() => decide('granted')}
                className="min-h-11 rounded-sm bg-ink px-4 text-[10px] uppercase tracking-widest text-cream"
              >
                accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Footer link that reopens the analytics choice. */
export function CookieSettingsLink({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={`inline-flex min-h-11 items-center px-2 uppercase tracking-widest hover:text-ink ${className}`}
    >
      cookie settings
    </button>
  );
}
