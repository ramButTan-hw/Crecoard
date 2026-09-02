import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Single source of truth for the app version shown in-app (Settings → About).
// Read from package.json at build time so the displayed version can never drift.
const appVersion = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;

// When building for Electron production, ELECTRON_BUILD=1 triggers static export.
// Dev and regular web builds work normally without it.
const isElectronBuild = process.env.ELECTRON_BUILD === "1";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  ...(isElectronBuild ? { output: "export", trailingSlash: true } : {}),
  images: { unoptimized: true },
  transpilePackages: ["@plancraft/ui", "@plancraft/db"],
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  ...(isElectronBuild
    ? {}
    : { headers: async () => [{ source: "/(.*)", headers: securityHeaders }] }),
};

export default nextConfig;
