import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Moduli Node nativi/server: non vanno bundlati, vanno richiesti a runtime.
  serverExternalPackages: ["better-sqlite3", "web-push", "imapflow", "nodemailer"],
  // Nasconde l'indicatore dev di Next che si sovrapporrebbe al dock di ORION.
  devIndicators: false,
};

export default nextConfig;
