import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest; Next injects the <link rel="manifest"> itself.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crecoard",
    short_name: "Crecoard",
    description: "Modular sandbox planner with community boards",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d0e11",
    theme_color: "#0d0e11",
    orientation: "any",
    categories: ["productivity", "social"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
