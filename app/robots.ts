import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Public marketing pages only. Event pages, galleries, couple portals and
// the studio admin are private and never belong in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/event/', '/api/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
