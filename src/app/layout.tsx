import type { Metadata } from "next";
import { site } from "@/lib/site";
import { isTestSite } from "@/lib/test-mode";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
// Free stand-in for Acumin Pro, the heading font on plumbing360.co.nz
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | Auckland plumbing, drainage and gas fitting`,
    template: `%s | ${site.name}`,
  },
  description:
    "Auckland plumbers, drainlayers and gasfitters. Answer a few quick questions, get free tips to fix it yourself, or book a licensed tradesperson.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NZ">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        {isTestSite() && (
          <div className="bg-red-200 px-4 py-1.5 text-center text-sm font-semibold text-red-950" role="status">
            TEST SITE: fake data only. No texts, emails, Fergus, Xero or payments reach anyone real.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
