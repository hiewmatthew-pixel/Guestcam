import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import '../styles/globals.css';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'GlanceCam · QR Code Wedding Camera for Guests',
    template: '%s · GlanceCam',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'GlanceCam',
  authors: [{ name: 'Golden Glance Studio' }],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_CA',
    url: '/',
    title: 'GlanceCam · QR Code Wedding Camera for Guests',
    description: SITE_DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'GlanceCam by Golden Glance Studio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GlanceCam · QR Code Wedding Camera for Guests',
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  appleWebApp: {
    capable: true,
    title: 'GlanceCam',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // no maximumScale: pinch-zoom must stay available (WCAG 1.4.4). iOS
  // input-focus zoom is avoided by the 16px input font in globals.css.
  themeColor: '#F5F1EA',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${cormorant.variable} ${inter.variable}`}>
      <body className="bg-cream text-ink min-h-screen">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
