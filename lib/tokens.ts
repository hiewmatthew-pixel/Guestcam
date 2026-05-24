// Unguessable share token for the couple's portal page. Uses a Crockford-ish
// alphabet (no 0/O/1/l/I) so it stays human-shareable if anyone ever needs to
// read it aloud. Format: xxxx-xxxx-xxxx (~60 bits of entropy).

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function generateManageToken(): string {
  const out: string[] = [];
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 12; i++) {
      out.push(ALPHABET[bytes[i] % ALPHABET.length]);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4, 8).join('')}-${out.slice(8, 12).join('')}`;
}
