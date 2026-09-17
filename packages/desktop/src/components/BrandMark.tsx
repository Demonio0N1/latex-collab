interface BrandMarkProps {
  size?: number;
}

/** Inline logomark: two overlapping documents with a LaTeX-style summation stroke. */
export function BrandMark({ size = 24 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="10" y="8" width="24" height="30" rx="4" fill="#2a2d36" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      <rect x="16" y="12" width="24" height="30" rx="4" fill="var(--accent, #5b8cff)" />
      <path
        d="M22 20h12l-6 7 6 7H22"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
