import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SCRIPT_BOOT_TEMA } from "@/lib/tema";

export const metadata: Metadata = {
  title: "ORION",
  description: "Il primo Sistema Operativo Conversazionale per professionisti.",
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
