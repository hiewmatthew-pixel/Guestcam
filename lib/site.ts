// Canonical public address and shared SEO copy. Search engines and link
// previews always point here, whichever URL a page was opened on.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cam.goldenglancestudio.com').replace(/\/+$/, '');
export const SITE_NAME = 'GlanceCam by Golden Glance Studio';
export const SITE_DESCRIPTION =
  'A QR code wedding camera for your guests: film-look photos, videos and voice notes, no app to download, gathered into one private gallery. Toronto-based, hosted in Canada.';

const OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: 'GlanceCam by Golden Glance Studio' };

/**
 * Per-page title, description and canonical URL, with the shared link
 * preview (Next replaces, not merges, a page's openGraph/twitter blocks).
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }) {
  const full = `${title} · GlanceCam`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website' as const, siteName: SITE_NAME, locale: 'en_CA', url: path, title: full, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image' as const, title: full, description, images: [OG_IMAGE.url] },
  };
}

/** The studio's main website (GlanceCam is one of its services). */
export const PARENT_SITE_URL = 'https://www.goldenglancestudio.com';
export const PARENT_NAME = 'Golden Glance Studio';
