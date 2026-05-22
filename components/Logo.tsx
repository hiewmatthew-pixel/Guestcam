type Props = { className?: string };

// GG monogram — two overlapping serif G's drawn at the same scale so they
// read as a unit at very small sizes (header chip).
export default function Logo({ className = 'h-6 w-6' }: Props) {
  return (
    <svg
      viewBox="0 0 64 40"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <text
        x="32"
        y="32"
        textAnchor="middle"
        fontFamily="var(--font-cormorant), 'Cormorant Garamond', 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight={500}
        fontSize="40"
        letterSpacing="-3"
        fill="currentColor"
      >
        GG
      </text>
    </svg>
  );
}
