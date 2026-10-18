import Image from "next/image";
import Link from "next/link";
import logo from "../../public/brand/logo.png";
import logoWhite from "../../public/brand/logo-white.png";

// Plumbing360 logo. `inverted` swaps the grey wording to white for dark backgrounds.
export function Logo({ inverted = false, className = "h-10 sm:h-12" }: { inverted?: boolean; className?: string }) {
  return (
    <Link href="/" className="inline-flex shrink-0 items-center" aria-label="Plumbing360 home">
      <Image
        src={inverted ? logoWhite : logo}
        alt="Plumbing360: Plumbing from every angle"
        priority={!inverted}
        sizes="200px"
        className={`w-auto ${className}`}
      />
    </Link>
  );
}
