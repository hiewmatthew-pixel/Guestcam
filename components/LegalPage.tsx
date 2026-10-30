import Link from 'next/link';
import Logo from '@/components/Logo';
import { CONTACT_EMAIL, mailto } from '@/lib/contact';
import StudioLink from '@/components/StudioLink';
import Analytics, { CookieSettingsLink } from '@/components/Analytics';

export const LEGAL_UPDATED = 'October 30, 2026';

/** Shared shell for /terms and /privacy: readable measure, studio header. */
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 pt-8 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 min-h-11">
          <Logo className="h-5 w-8 text-ink" />
          <span className="text-[11px] tracking-widest uppercase text-ink/70">Golden Glance Studio</span>
        </Link>
      </header>

      <article className="legal px-6 pt-14 pb-16 max-w-2xl mx-auto w-full text-sm leading-relaxed text-ink/80">
        <h1 className="font-serif italic text-4xl text-ink">{title}</h1>
        <p className="mt-2 text-[10px] uppercase tracking-widest text-ink/70">last updated {LEGAL_UPDATED}</p>
        {children}
      </article>

      <footer className="mt-auto px-6 py-8 text-center text-[10px] tracking-widest uppercase text-ink/70 border-t border-warm-gray-light">
        <p>Crafted in Toronto by <StudioLink /></p>
        <Link href="/terms" className="inline-flex min-h-11 items-center px-2 hover:text-ink">terms</Link>·
        <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 hover:text-ink">privacy</Link>·
        <a href={mailto('GlanceCam question')} className="inline-flex min-h-11 items-center px-2 normal-case tracking-normal hover:text-ink">
          {CONTACT_EMAIL}
        </a>·
        <CookieSettingsLink />
      </footer>
      <Analytics />
    </main>
  );
}

export function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 mb-3 scroll-mt-6 font-serif italic text-2xl text-ink">
      {children}
    </h2>
  );
}
