import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { AccessibilityInit } from "@/components/shell/AccessibilityInit";

export const metadata: Metadata = {
  title: "Crecoard",
  description: "Modular sandbox planner with community servers",
  applicationName: "Crecoard",
  appleWebApp: { capable: true, title: "Crecoard", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* crossOrigin makes the stylesheet's cssRules readable, which board image
            export (html-to-image) needs to embed Inter into the exported PNG */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
          crossOrigin="anonymous"
        />
      </head>
      <body suppressHydrationWarning>
        <ServiceWorkerRegistrar />
        <AccessibilityInit />
        {children}
      </body>
    </html>
  );
}
