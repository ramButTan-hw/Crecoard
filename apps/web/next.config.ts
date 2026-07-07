import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Single source of truth for the app version shown in-app (Settings → About).
// Read from package.json at build time so the displayed version can never drift.
const appVersion = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;

// When building for Electron production, ELECTRON_BUILD=1 triggers static export.
// Dev and regular web builds work normally without it.
const isElectronBuild = process.env.ELECTRON_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isElectronBuild ? { output: "export", trailingSlash: true } : {}),
  images: { unoptimized: true },
  transpilePackages: ["@plancraft/ui", "@plancraft/db"],
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
};

export default nextConfig;
