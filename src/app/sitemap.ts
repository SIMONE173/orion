import type { MetadataRoute } from "next";

const SITO = process.env.ORION_SITO_URL || "https://orionvision.it";

export default function sitemap(): MetadataRoute.Sitemap {
  const oggi = new Date();
  return [
    { url: SITO, lastModified: oggi, changeFrequency: "weekly", priority: 1 },
    { url: `${SITO}/privacy`, lastModified: oggi, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITO}/termini`, lastModified: oggi, changeFrequency: "yearly", priority: 0.3 },
  ];
}
