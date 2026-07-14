import type { NextRequest } from "next/server";

// L'indirizzo PUBBLICO di ORION (per i redirect di Stripe, ecc.). Dietro il
// proxy di Railway req.nextUrl.origin è l'indirizzo INTERNO (localhost:8080):
// va usato invece l'host pubblico dagli header inoltrati, o il dominio ufficiale.
export function originePubblica(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  if (host && !host.includes("localhost") && !host.startsWith("127.")) {
    return `${proto}://${host}`;
  }
  return (process.env.ORION_SITO_URL || "https://orionvision.it").replace(/\/$/, "");
}
