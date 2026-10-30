import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { TIER_LIST, formatPriceCAD } from '@/lib/tiers';
import { CONTACT_EMAIL as INQUIRY_EMAIL } from '@/lib/contact';
import { pageMetadata, SITE_NAME, SITE_URL } from '@/lib/site';

const TITLE = 'Pricing: QR Code Wedding Camera & Live Photo Gallery';
const DESCRIPTION =
  'One flat price per wedding, from $79 CAD. Guests scan a QR code to capture film-look photos, videos and voice notes, no app needed. Live slideshow, unlimited guests, HST included.';

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: '/pricing' });

function inquiryHref(tierLabel: string, price: number) {
  const subject = `GlanceCam · ${tierLabel}`;
  const body =
    `Hello Golden Glance,\n\n` +
    `We'd love to book the ${tierLabel} tier (${formatPriceCAD(price)}) for our wedding.\n\n` +
    `Our names: \n` +
    `Wedding date: \n` +
    `Venue (if booked): \n\n` +
    `Thank you,\n`;
  return `mailto:${INQUIRY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const FAQ = [
  {
    q: 'do my guests need to download an app?',
    a: 'No. Guests scan the QR code on your table cards and the camera opens straight in their phone’s browser, on iPhone and Android. No app, no account, no sign-up.',
  },
  {
    q: 'how is this different from a free photo-sharing app?',
    a: 'GlanceCam is done for you. We set up your event, design your print-ready QR table card and support you on the day. Guests get real film looks, photobooth strips, video and voice notes, captures keep sending even on weak venue Wi-Fi, and your photos are hosted in Canada.',
  },
  {
    q: 'is the price per guest, or one flat fee?',
    a: 'One flat fee for the whole wedding, HST included. There are no per-photo or per-guest charges on any package, so bring everyone.',
  },
  {
    q: 'how long do you keep the gallery up?',
    a: 'Guests can view and add to the shared gallery for 7 days on Glimpse, 30 days on Signature and a full year on Studio. You can download everything as one ZIP at any time. The originals are then permanently deleted 60 days (Glimpse), 90 days (Signature) or 13 months (Studio) after the wedding, and your private portal shows the exact dates.',
  },
  {
    q: 'can guests leave a voice message?',
    a: 'Yes, on Signature and Studio. Shy guests can record an audio message instead of a photo, like an audio guestbook without the phone booth.',
  },
  {
    q: 'can we show the photos live at the reception?',
    a: 'Yes. Signature and Studio include a live slideshow that plays new photos and films on any TV or projector as guests capture them.',
  },
  {
    q: 'how do we pay?',
    a: 'A 25% deposit by e-transfer reserves your date. The balance is invoiced through ShootProof, which accepts credit card. We send a short contract before either payment.',
  },
  {
    q: 'do you work outside Toronto?',
    a: 'Yes. We are based in Toronto, but GlanceCam runs anywhere your guests have a phone signal or Wi-Fi, across Canada and beyond.',
  },
];

function structuredData() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'GlanceCam wedding guest camera',
      description: DESCRIPTION,
      brand: { '@type': 'Brand', name: 'Golden Glance Studio' },
      url: `${SITE_URL}/pricing`,
      image: `${SITE_URL}/opengraph-image`,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'CAD',
        lowPrice: Math.min(...TIER_LIST.map((t) => t.price)),
        highPrice: Math.max(...TIER_LIST.map((t) => t.price)),
        offerCount: TIER_LIST.length,
        offers: TIER_LIST.map((t) => ({
          '@type': 'Offer',
          name: `${t.label} package`,
          description: t.blurb,
          price: t.price,
          priceCurrency: 'CAD',
          availability: 'https://schema.org/InStock',
          url: `${SITE_URL}/pricing`,
          seller: { '@type': 'Organization', name: SITE_NAME },
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q.charAt(0).toUpperCase() + q.slice(1),
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];
}

export default function PricingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        // static, server-built JSON; < is escaped so it can't close the tag
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }}
      />
      <header className="px-6 pt-8 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 min-h-11">
          <Logo className="h-5 w-8 text-ink" />
          <span className="text-[11px] tracking-widest uppercase text-ink/70">
            Golden Glance Studio
          </span>
        </Link>
        <Link
          href="/admin"
          className="ml-auto inline-flex items-center min-h-11 px-1 text-[10px] uppercase tracking-widest text-ink/70 hover:text-ink"
        >
          studio admin
        </Link>
      </header>

      <section className="px-6 pt-20 pb-12 text-center">
        <h1 className="font-sans text-[11px] tracking-widest uppercase text-ink/70 mb-6">
          QR code wedding camera · pricing
        </h1>
        <p className="font-serif italic text-5xl sm:text-6xl leading-[1.05] text-ink max-w-2xl mx-auto">
          one quiet payment,
          <br />
          one shared evening
        </p>
        <p className="mt-6 text-ink/70 leading-relaxed max-w-lg mx-auto">
          Your guests scan a QR code and a film-look camera opens on their phone,
          no app to download. Every photo, film and voice note gathers in one
          private gallery for you. One flat price per wedding: no per-photo fees,
          no per-guest limits.
        </p>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3 items-stretch">
          {TIER_LIST.map((t) => {
            const isHero = t.id === 'signature';
            return (
              <article
                key={t.id}
                className={[
                  'relative flex flex-col rounded-sm border p-8',
                  isHero
                    ? 'border-gold bg-white shadow-[0_1px_0_rgba(184,149,106,0.15)]'
                    : 'border-warm-gray-light bg-cream',
                ].join(' ')}
              >
                {isHero && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-ink text-[10px] uppercase tracking-widest px-3 py-1 rounded-sm">
                    most chosen
                  </span>
                )}

                <header>
                  <h2 className="font-serif text-3xl text-ink">{t.label}</h2>
                  <p className="font-serif italic text-ink/70 mt-1">{t.italic}</p>
                </header>

                <p className="mt-6 font-serif italic text-4xl text-ink">
                  {formatPriceCAD(t.price)}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-ink/70 mt-1">
                  per event · all-in
                </p>

                <p className="mt-6 text-ink/70 leading-relaxed">{t.blurb}</p>

                <ul className="mt-8 space-y-3 text-sm text-ink/80 flex-1">
                  {t.bullets.map((b) => (
                    <li key={b} className="flex gap-3">
                      <span aria-hidden className="text-gold-deep mt-1">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={inquiryHref(t.label, t.price)}
                  className={[
                    'mt-10 block text-center py-3 text-xs uppercase tracking-widest',
                    isHero
                      ? 'bg-ink text-cream'
                      : 'border border-ink text-ink hover:bg-ink hover:text-cream transition-colors',
                  ].join(' ')}
                >
                  begin a conversation
                </a>
              </article>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-ink/70 max-w-md mx-auto leading-relaxed">
          Reserve with a 25% deposit by e-transfer. The balance is invoiced through
          ShootProof, and you can pay it by credit card.
        </p>
        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-ink/70">
          Toronto-based · Prices in CAD · HST included
        </p>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif italic text-3xl text-center text-ink">
            quiet questions
          </h2>
          <dl className="mt-10 divide-y divide-warm-gray-light">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="py-6">
                <dt className="font-serif italic text-xl text-ink">{q}</dt>
                <dd className="mt-2 text-ink/70 leading-relaxed">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-[10px] tracking-widest uppercase text-ink/70 border-t border-warm-gray-light">
        Crafted in Toronto ·{' '}
        <a href={`mailto:${INQUIRY_EMAIL}`} className="inline-flex min-h-11 items-center underline underline-offset-4 decoration-ink/40 hover:decoration-ink">
          {INQUIRY_EMAIL}
        </a>
        <br />
        <Link href="/terms" className="inline-flex min-h-11 items-center px-2 hover:text-ink">terms</Link>·
        <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 hover:text-ink">privacy</Link>
      </footer>
    </main>
  );
}
