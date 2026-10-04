// Every customer-facing contact point routes here. Quotes and invoices
// are sent through ShootProof, so the app has no checkout of its own.
export const CONTACT_EMAIL = 'hello@goldenglancestudio.com';

export function mailto(subject?: string, body?: string): string {
  const q = [
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body)}` : '',
  ].filter(Boolean).join('&');
  return `mailto:${CONTACT_EMAIL}${q ? `?${q}` : ''}`;
}
