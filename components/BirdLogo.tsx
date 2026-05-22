type Props = { className?: string };

export default function BirdLogo({ className = 'h-6 w-6' }: Props) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2 24 C 12 14, 22 14, 32 22 C 42 14, 52 14, 62 24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14 24 C 20 22, 26 22, 32 24 C 38 22, 44 22, 50 24"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}
