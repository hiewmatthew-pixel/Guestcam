import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Offline · GlanceCam',
  robots: { index: false, follow: false },
};

// Precached by public/sw.js and served when a navigation fails offline.
export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <Logo className="h-10 w-16 text-gold mb-10" />
      <p className="text-[11px] tracking-widest uppercase text-ink/70 mb-4">GlanceCam</p>
      <h1 className="text-4xl italic mb-5">You&rsquo;re offline</h1>
      <p className="max-w-sm text-sm leading-relaxed text-ink/70 mb-10">
        Your captures need a connection to send. Reconnect and try again.
      </p>
      <Link
        href="/"
        className="text-[11px] uppercase tracking-widest border border-ink/20 px-6 py-3 hover:border-ink/50"
      >
        Back home
      </Link>
    </main>
  );
}
