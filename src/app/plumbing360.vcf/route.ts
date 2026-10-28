// The contact card: opening it on a phone offers "Add to contacts" with our name, logo and the number
// customers can text ("new job").
import { type NextRequest } from "next/server";
import { loadContactCard, vcard } from "@/lib/contact-card";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const card = await loadContactCard();
  const origin = (card.site_url ?? process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  let photo: string | null = null;
  try {
    const res = await fetch(new URL("/brand/contact.png", req.nextUrl.origin), { cache: "force-cache" });
    if (res.ok) photo = Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    // no logo: the card still works
  }
  return new Response(vcard(card, origin, photo), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Plumbing 360.vcf"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
