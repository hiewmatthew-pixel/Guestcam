import Link from 'next/link';
import Logo from '@/components/Logo';
import { TIER_LIST, formatPriceCAD } from '@/lib/tiers';

const INQUIRY_EMAIL = 'hello@goldenglancestudio.com';

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
    q: 'do my guests need to install anything?',
    a: 'No. They scan a small QR card at the table, and the camera opens in their browser. No app, no account, no friction.',
  },
  {
    q: 'how long do you keep the gallery up?',
    a: 'Glimpse keeps it shared for 7 days. Signature for 30. Studio for a full year. Everything is also yours to download as a single ZIP at any point.',
  },
  {
    q: 'is the price per guest, or one flat fee?',
    a: 'One flat fee for the whole evening. You should never have to think about a per-photo cost on your wedding day, and your guests should never be metered.',
  },
  {
    q: 'how do we pay?',
    a: 'A 25% deposit by e-transfer reserves your date. The balance is billed through ShootProof, which accepts credit card. We send a small contract before either payment so everything is on paper.',
  },
  {
    q: 'what if our wedding is bigger than expected?',
    a: 'Capacity is open on every tier — the difference is the feature set, not the guest count. Bring everyone.',
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 pt-8 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <Logo className="h-5 w-8 text-ink" />
          <span className="text-[11px] tracking-widest uppercase text-ink/70">
            Golden Glance Studio
          </span>
        </Link>
        <Link
          href="/admin"
          className="ml-auto text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink"
        >
          studio admin
        </Link>
      </header>

      <section className="px-6 pt-20 pb-12 text-center">
        <p className="text-[11px] tracking-widest uppercase text-ink/50 mb-6">
          pricing
        </p>
        <h1 className="font-serif italic text-5xl sm:text-6xl leading-[1.05] text-ink max-w-2xl mx-auto">
          one quiet payment,
          <br />
          one shared evening
        </h1>
        <p className="mt-6 text-ink/65 leading-relaxed max-w-lg mx-auto">
          No per-photo fees, no per-guest meters. Pick the tier that fits the
          shape of your day. Everything else is included.
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
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-cream text-[9px] uppercase tracking-widest px-3 py-1 rounded-sm">
                    most chosen
                  </span>
                )}

                <header>
                  <h2 className="font-serif text-3xl text-ink">{t.label}</h2>
                  <p className="font-serif italic text-ink/55 mt-1">{t.italic}</p>
                </header>

                <p className="mt-6 font-serif italic text-4xl text-ink">
                  {formatPriceCAD(t.price)}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-ink/50 mt-1">
                  per event · all-in
                </p>

                <p className="mt-6 text-ink/70 leading-relaxed">{t.blurb}</p>

                <ul className="mt-8 space-y-3 text-sm text-ink/80 flex-1">
                  {t.bullets.map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="text-gold mt-1">·</span>
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

        <p className="mt-10 text-center text-xs text-ink/55 max-w-md mx-auto leading-relaxed">
          Reserve with a 25% deposit by e-transfer, balance billed through ShootProof.
        </p>
        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-ink/40">
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

      <footer className="px-6 py-8 text-center text-[10px] tracking-widest uppercase text-ink/40 border-t border-warm-gray-light">
        Crafted in Toronto · goldenglancestudio.com
      </footer>
    </main>
  );
}
