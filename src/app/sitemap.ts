import type { MetadataRoute } from "next";
import { loadAreaPages } from "@/lib/marketing";
import { services } from "@/lib/services";
import { site } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = ["", "/services", "/why-choose-us", "/about", "/contact", "/get-started", "/areas", "/privacy", "/terms"];
  const areas = await loadAreaPages().catch(() => []);
  return [
    ...paths.map((p) => ({ url: `${site.url}${p}` })),
    ...services.map((s) => ({ url: `${site.url}/services/${s.slug}` })),
    ...areas.map((a) => ({ url: `${site.url}/areas/${a.slug}`, lastModified: a.updated })),
  ];
}
