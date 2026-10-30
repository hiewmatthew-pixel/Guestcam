import { PARENT_NAME, PARENT_SITE_URL } from '@/lib/site';

/** "Golden Glance Studio", linking to the studio's main website. */
export default function StudioLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={PARENT_SITE_URL}
      className={`inline-flex min-h-11 items-center underline underline-offset-4 decoration-ink/40 hover:decoration-ink hover:text-ink ${className}`}
    >
      {PARENT_NAME}
    </a>
  );
}
