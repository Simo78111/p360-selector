import Link from "next/link";

// Text wordmark until the real logo files are supplied.
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Plumbing360 home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke="#49c7eb" strokeWidth="4" strokeDasharray="70 12" />
        <circle cx="16" cy="16" r="4" fill="#49c7eb" />
      </svg>
      <span className={`font-display text-xl font-bold ${inverted ? "text-white" : "text-ink"}`}>
        Plumbing<span className="text-aqua">360</span>
      </span>
    </Link>
  );
}
