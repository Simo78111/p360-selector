import { notFound } from "next/navigation";
import { CertificateView } from "@/components/certificates/CertificateView";
import { Container } from "@/components/ui";
import { gasCertByToken } from "@/lib/automation";

export const metadata = { title: "Gas certificate", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,}$/.test(token)) notFound();
  const c = await gasCertByToken(token).catch(() => null);
  if (!c || c.status !== "signed") notFound();
  return (
    <Container className="max-w-3xl py-10">
      <CertificateView c={c} />
      <p className="mt-4 text-center text-sm text-slate print:hidden">Use your browser&apos;s Print to save it as a PDF.</p>
    </Container>
  );
}
