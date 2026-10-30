import Link from 'next/link';
import Logo from '@/components/Logo';
import type { Metadata } from 'next';
import { CONTACT_EMAIL, mailto } from '@/lib/contact';
import { PARENT_NAME, PARENT_SITE_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import StudioLink from '@/components/StudioLink';
import Analytics, { CookieSettingsLink } from '@/components/Analytics';

export const metadata: Metadata = { alternates: { canonical: '/' } };

const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  email: CONTACT_EMAIL,
  image: `${SITE_URL}/opengraph-image`,
  logo: `${SITE_URL}/pwa-icons/icon-512.png`,
  priceRange: '$79–$299 CAD',
  address: { '@type': 'PostalAddress', addressLocality: 'Toronto', addressRegion: 'ON', addressCountry: 'CA' },
  areaServed: 'CA',
  parentOrganization: { '@type': 'Organization', name: PARENT_NAME, url: PARENT_SITE_URL },
  sameAs: [PARENT_SITE_URL],
};

export default function MarketingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION).replace(/</g, '\\u003c') }}
      />
      <header className="px-6 pt-8 flex items-center gap-3">
        <a href={PARENT_SITE_URL} className="flex min-h-11 items-center gap-3 group">
          <Logo className="h-5 w-8 text-ink" />
          <span className="text-[11px] tracking-widest uppercase text-ink/70 group-hover:text-ink transition-colors">
            Golden Glance Studio
          </span>
        </a>
      </header>

      <section className="flex-1 grid place-items-center px-6 py-16">
        <div className="max-w-xl text-center">
          <p className="text-[11px] tracking-widest uppercase text-ink/70 mb-6">
            GlanceCam
          </p>
          <h1 className="font-serif italic text-5xl sm:text-6xl leading-[1.05] text-ink">
            your moments,
            <br />
            together
          </h1>
          <p className="mt-8 text-ink/70 leading-relaxed">
            A wedding camera built for your guests. They scan a QR code, no app to
            download, and their film-look photos, videos and voice notes gather
            into one quiet, shared gallery.
          </p>

          <div className="mt-12 flex items-center justify-center gap-6 flex-wrap">
            <Link
              href="/pricing"
              className="inline-flex items-center min-h-11 text-xs uppercase tracking-widest border-b border-gold text-ink"
            >
              see pricing
            </Link>
            <span aria-hidden className="text-ink/70">·</span>
            <Link
              href="/event/demo"
              className="inline-flex items-center min-h-11 text-xs uppercase tracking-widest text-ink/70 underline-offset-4 hover:underline"
            >
              try the camera
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-[10px] tracking-widest uppercase text-ink/70">
        Crafted in Toronto by <StudioLink /> ·{' '}
        <a href={mailto('GlanceCam inquiry')} className="inline-flex min-h-11 items-center underline underline-offset-4 decoration-ink/40 hover:decoration-ink">
          {CONTACT_EMAIL}
        </a>
        <br />
        <Link href="/terms" className="inline-flex min-h-11 items-center px-2 hover:text-ink">terms</Link>·
        <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 hover:text-ink">privacy</Link>·
        <CookieSettingsLink />
      </footer>
      <Analytics />
    </main>
  );
}
