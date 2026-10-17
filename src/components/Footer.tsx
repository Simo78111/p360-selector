import Link from "next/link";
import { nav, site } from "@/lib/site";
import { services } from "@/lib/services";
import { Logo } from "./Logo";
import { Container } from "./ui";

export function Footer() {
  return (
    <footer className="bg-ink text-white/80">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo inverted />
          <p className="mt-4 text-sm">{site.tagline}.</p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Services</h2>
          <ul className="space-y-2 text-sm">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={`/services/${s.slug}`} className="hover:text-aqua">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Company</h2>
          <ul className="space-y-2 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-aqua">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/privacy" className="hover:text-aqua">
                Privacy policy
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Contact</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a href={site.phoneHref} className="hover:text-aqua">
                {site.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${site.email}`} className="hover:text-aqua">
                {site.email}
              </a>
            </li>
            <li>{site.hours}</li>
            <li>Servicing {site.area}</li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="py-5 text-xs text-white/60">
          © {new Date().getFullYear()} {site.name}. All work carried out by licensed tradespeople.
        </Container>
      </div>
    </footer>
  );
}
