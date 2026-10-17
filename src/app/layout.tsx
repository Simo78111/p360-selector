import type { Metadata } from "next";
import { Archivo, Poppins } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { site } from "@/lib/site";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Free stand-in for Acumin Pro, the heading font on plumbing360.co.nz
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

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
      <body className={`${poppins.variable} ${archivo.variable} flex min-h-screen flex-col font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only z-50 rounded bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
