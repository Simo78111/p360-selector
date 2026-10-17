import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

type ButtonProps = ComponentProps<typeof Link> & { variant?: "primary" | "dark" | "outline" };

export function ButtonLink({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-aqua text-ink hover:bg-[#35b9df]",
    dark: "bg-ink text-white hover:bg-slate",
    outline: "border-2 border-ink text-ink hover:bg-ink hover:text-white",
  }[variant];
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold transition-colors ${styles} ${className}`}
      {...props}
    />
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <section className="bg-aqua-pale">
      <Container className="py-14 sm:py-20">
        {eyebrow && <p className="mb-3 text-sm font-semibold tracking-wide text-aqua-deep uppercase">{eyebrow}</p>}
        <h1 className="max-w-3xl text-4xl font-bold sm:text-5xl">{title}</h1>
        {children && <div className="mt-5 max-w-2xl text-lg text-slate">{children}</div>}
      </Container>
    </section>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-5 w-5 shrink-0 ${className}`}>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const servicePaths: Record<string, ReactNode> = {
  plumbing: (
    <path d="M7 3v4a2 2 0 0 0 2 2h6a3 3 0 0 1 3 3v2M5 3h4M16 17c0 1.7 1 3 2 4m0 0c1-1 2-2.3 2-4a2 2 0 0 0-4 0Z" />
  ),
  drainage: <path d="M4 4h16v4H4zM6 8v4a6 6 0 0 0 12 0V8M10 20h4M12 16v4" />,
  "gas-fitting": (
    <path d="M12 21c4 0 7-2.7 7-6.5 0-3.3-2.2-5.4-4-7.5-.4 2-1.4 3-2.5 3C13.5 7 12 4.5 9 3c.3 3-1.4 5-2.7 6.7A7.4 7.4 0 0 0 5 14.5C5 18.3 8 21 12 21Z" />
  ),
};

export function ServiceIcon({ slug, className = "" }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {servicePaths[slug]}
    </svg>
  );
}
