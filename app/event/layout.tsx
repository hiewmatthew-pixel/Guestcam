import type { Metadata } from 'next';

// Guest cameras, galleries and couple portals are private links.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
