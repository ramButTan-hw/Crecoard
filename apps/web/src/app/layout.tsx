import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { AccessibilityInit } from "@/components/shell/AccessibilityInit";

// Self-hosted via next/font (was a render-blocking Google Fonts request).
// Same-origin @font-face rules also keep board PNG export (html-to-image)
// able to read and embed the font.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crecoard.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Crecoard — build your workflow on an infinite board",
    template: "%s · Crecoard",
  },
  description:
    "A collaborative visual workspace: drag-and-drop blocks, custom widgets, and shared spaces on an infinite canvas.",
  applicationName: "Crecoard",
  appleWebApp: { capable: true, title: "Crecoard", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "Crecoard",
    title: "Crecoard — build your workflow on an infinite board",
    description:
      "A collaborative visual workspace: drag-and-drop blocks, custom widgets, and shared spaces on an infinite canvas.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Crecoard" }],
  },
  twitter: {
    card: "summary",
    title: "Crecoard — build your workflow on an infinite board",
    description:
      "A collaborative visual workspace: drag-and-drop blocks, custom widgets, and shared spaces on an infinite canvas.",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // allow pinch-zoom for accessibility
  viewportFit: "cover", // extend under notches; pair with safe-area insets
  themeColor: "#0d0e11",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ServiceWorkerRegistrar />
        <AccessibilityInit />
        {children}
      </body>
    </html>
  );
}
