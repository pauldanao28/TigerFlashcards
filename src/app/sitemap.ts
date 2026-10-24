import { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flashkado.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const jlptLevels = ["n5", "n4", "n3", "n2", "n1"];

  const jlptPages = jlptLevels.map((level) => ({
    url: `${siteUrl}/jlpt/${level}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...jlptPages,
  ];
}
