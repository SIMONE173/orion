import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 è un modulo nativo: non va bundlato, va caricato a runtime su Node.
  serverExternalPackages: ["better-sqlite3"],
  // Nasconde l'indicatore dev di Next che si sovrapporrebbe al dock di ORION.
  devIndicators: false,
};

export default nextConfig;
