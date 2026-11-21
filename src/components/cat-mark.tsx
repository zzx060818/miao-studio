export function CatMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 42" aria-hidden="true">
      <path d="M8 20 L8 8 L18 18" fill="#fffdf8" stroke="#1c1915" strokeWidth="2.4" strokeLinejoin="miter" />
      <path d="M40 20 L40 8 L30 18" fill="#fffdf8" stroke="#1c1915" strokeWidth="2.4" strokeLinejoin="miter" />
      <ellipse cx="24" cy="24" rx="15" ry="13" fill="#fffdf8" stroke="#1c1915" strokeWidth="2.4" />
      <circle cx="18.5" cy="23" r="1.5" fill="#1c1915" />
      <circle cx="29.5" cy="23" r="1.5" fill="#1c1915" />
      <path d="M22.2 28.2 h3.6 l-1.8 2.2 z" fill="#1c1915" />
      <path d="M6 25 H12 M36 25 H42" stroke="#1c1915" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

export function CheckMark() {
  return (
    <svg className="check" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1" y="1" width="12" height="12" fill="#fffdf8" stroke="#1c1915" strokeWidth="1.6" />
      <path d="M3.2 7.2 L6 10 L10.8 4" fill="none" stroke="#7b2ff7" strokeWidth="1.8" />
    </svg>
  );
}
