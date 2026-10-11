/** Vita — original friendly robot mascot (inline SVG). */
export function VitaMascot({ className = "", animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={`${animated ? "vita-idle" : ""} ${className}`}>
      <line x1="24" y1="5" x2="24" y2="11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="5" r="2.8" fill="var(--highlight)" />
      <rect x="8" y="11" width="32" height="26" rx="11" fill="currentColor" />
      <rect x="12" y="16" width="24" height="15" rx="7.5" fill="var(--vita)" />
      <ellipse className="vita-eye" cx="19" cy="23" rx="2.6" ry="3.2" fill="currentColor" />
      <ellipse className="vita-eye" cx="29" cy="23" rx="2.6" ry="3.2" fill="currentColor" />
      <path d="M20.5 27.5q3.5 2.6 7 0" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <rect x="4" y="20" width="4" height="9" rx="2" fill="currentColor" />
      <rect x="40" y="20" width="4" height="9" rx="2" fill="currentColor" />
      <path d="M17 37h14l-2 5H19z" fill="currentColor" />
    </svg>
  );
}
