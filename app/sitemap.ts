import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date('2026-10-30');
  return [
    { url: `${SITE_URL}/`, lastModified: updated, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: updated, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/terms`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
