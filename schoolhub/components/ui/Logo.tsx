export function Logo({
  className = "",
  mark = true,
}: {
  className?: string;
  mark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      {mark && (
        <svg
          width="28"
          height="28"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect width="32" height="32" rx="8" fill="#0a4d8c" />
          <path d="M16 6L26 11L16 16L6 11L16 6Z" fill="#f5a623" />
          <path
            d="M10 14.5V19.5C10 19.5 12.5 22 16 22C19.5 22 22 19.5 22 19.5V14.5"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className="tracking-tight">
        SchoolHub <span className="text-brand-accent">Jamaica</span>
      </span>
    </span>
  );
}
