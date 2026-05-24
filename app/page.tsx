import Link from 'next/link';
import Logo from '@/components/Logo';

export default function MarketingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 pt-8 flex items-center gap-3">
        <Logo className="h-5 w-8 text-ink" />
        <span className="text-[11px] tracking-widest uppercase text-ink/70">
          Golden Glance Studio
        </span>
      </header>

      <section className="flex-1 grid place-items-center px-6 py-16">
        <div className="max-w-xl text-center">
          <p className="text-[11px] tracking-widest uppercase text-ink/50 mb-6">
            GlanceCam
          </p>
          <h1 className="font-serif italic text-5xl sm:text-6xl leading-[1.05] text-ink">
            your moments,
            <br />
            together
          </h1>
          <p className="mt-8 text-ink/70 leading-relaxed">
            A small camera built for your guests. Film-look photos and short videos —
            captured on their phones, gathered into one quiet, shared gallery.
          </p>

          <div className="mt-12 flex items-center justify-center gap-6 flex-wrap">
            <Link
              href="/pricing"
              className="text-xs uppercase tracking-widest border-b border-gold pb-1 text-ink"
            >
              see pricing
            </Link>
            <span className="text-ink/30">·</span>
            <Link
              href="/event/demo"
              className="text-xs uppercase tracking-widest text-ink/70 underline-offset-4 hover:underline"
            >
              try the camera
            </Link>
            <span className="text-ink/30">·</span>
            <Link
              href="/admin"
              className="text-xs uppercase tracking-widest text-ink/70 underline-offset-4 hover:underline"
            >
              studio admin
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-[10px] tracking-widest uppercase text-ink/40">
        Crafted in Toronto · goldenglancestudio.com
      </footer>
    </main>
  );
}
