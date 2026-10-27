import type { Metadata } from "next";
import { ScreenBoard } from "@/components/screen/ScreenBoard";
import { loadScreen } from "@/lib/screen";

// The office TV. Opened with the secret link from Settings → Office screen (no password on the TV).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Office screen · Plumbing360" }, robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

export default async function ScreenPage({ params }: Props) {
  const { token } = await params;
  const data = await loadScreen(token).catch(() => null);
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1116] p-10 text-center text-white">
        <div>
          <h1 className="text-4xl font-bold">This screen link doesn&apos;t work</h1>
          <p className="mt-4 text-xl text-white/70">
            Get the current link from the office console: Settings → Office screen.
          </p>
        </div>
      </main>
    );
  }
  return <ScreenBoard token={token} initial={data} />;
}
