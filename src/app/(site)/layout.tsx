import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PageViews } from "@/components/PageViews";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <PageViews />
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
