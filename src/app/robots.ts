import type { MetadataRoute } from "next";

const SITO = process.env.ORION_SITO_URL || "https://orionvision.it";

// I motori indicizzano la vetrina; l'app e le API restano fuori.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api/"] }],
    sitemap: `${SITO}/sitemap.xml`,
  };
}
