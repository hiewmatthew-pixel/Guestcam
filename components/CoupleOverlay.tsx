// Always-on overlay rendered for Studio events. Burns the couple's
// names and wedding date into every photo. Reused on the live camera
// view + the photo review screen so guests see exactly what gets saved.

type Props = {
  coupleNames?: string;
  weddingDate?: string;
  // 'live' on the camera viewfinder; 'review' on the still review
  variant?: 'live' | 'review';
};

function formatDate(input?: string): string | null {
  if (!input) return null;
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    const parts = d
      .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      .split('/');
    return parts.join(' · ');
  } catch {
    return null;
  }
}

export default function CoupleOverlay({ coupleNames, weddingDate, variant = 'live' }: Props) {
  const date = formatDate(weddingDate);
  if (!coupleNames && !date) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-[6%] flex flex-col items-center pointer-events-none select-none"
      style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}
      aria-hidden
    >
      {coupleNames && (
        <p
          className="font-serif italic text-gold leading-none"
          style={{ fontSize: variant === 'live' ? 'clamp(22px, 5.5vw, 42px)' : 'clamp(18px, 4vw, 34px)' }}
        >
          {coupleNames}
        </p>
      )}
      {date && (
        <p
          className="mt-2 uppercase text-gold/95"
          style={{
            fontSize: variant === 'live' ? 'clamp(9px, 1.6vw, 12px)' : 'clamp(8px, 1.4vw, 11px)',
            letterSpacing: '0.42em',
          }}
        >
          {date}
        </p>
      )}
    </div>
  );
}
