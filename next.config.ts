import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Moduli Node nativi/server: non vanno bundlati, vanno richiesti a runtime.
  serverExternalPackages: ["better-sqlite3", "web-push", "imapflow", "nodemailer"],
  // Nasconde l'indicatore dev di Next che si sovrapporrebbe al dock di ORION.
  devIndicators: false,
  // Header di sicurezza su ogni risposta. Niente CSP stretta per ora: ORION
  // usa script inline (tema) e i modelli MediaPipe da CDN; questi qui sotto
  // sono i guadagni sicuri che non rompono nulla.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Solo HTTPS, ricordato dal browser per 2 anni (Railway è già HTTPS).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // I tipi dichiarati non si "indovinano" (blocca lo sniffing MIME).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // ORION non si incornicia in siti altrui (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Ai siti esterni non arriva l'URL interno completo.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera/microfono solo per ORION stesso (gli servono!), il resto spento.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
