import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/search";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://forethought.chat";
  const catalog = await getCatalog();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/browse`, changeFrequency: "weekly", priority: 0.6 },
    ...catalog.map((c) => ({
      url: `${base}/article/${c.category}/${c.slug}`,
      lastModified: c.publishedAt ? new Date(c.publishedAt) : undefined,
      changeFrequency: "monthly" as const,
      priority: c.category === "research" ? 0.7 : 0.4,
    })),
  ];
}
