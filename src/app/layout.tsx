import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SCRIPT_BOOT_TEMA } from "@/lib/tema";

const SITO = process.env.ORION_SITO_URL || "https://orionvision.it";

export const metadata: Metadata = {
  metadataBase: new URL(SITO),
  title: { default: "ORION — il Sistema Operativo Conversazionale", template: "%s · ORION" },
  description:
    "Non impari a usarlo: gli parli. ORION è la segreteria operativa intelligente che gestisce agenda, clienti, fatture e team — e si aggancia al gestionale che usi già.",
  applicationName: "ORION",
  keywords: ["ORION", "assistente vocale", "segretaria virtuale", "gestionale", "professionisti", "agenda", "intelligenza artificiale"],
  authors: [{ name: "ORION" }],
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: SITO,
    siteName: "ORION",
    title: "ORION — il Sistema Operativo Conversazionale",
    description: "Non impari a usarlo: gli parli. La segreteria operativa intelligente per professionisti e aziende.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ORION — il Sistema Operativo Conversazionale",
    description: "Non impari a usarlo: gli parli. La segreteria operativa intelligente per professionisti e aziende.",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* ORION su misura: riapplica il tema salvato PRIMA del primo paint,
            così al riavvio non c'è nessun lampo del ciano di default. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_BOOT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
