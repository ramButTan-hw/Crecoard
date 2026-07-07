import type { Metadata } from "next";
import Link from "next/link";
import { Download, Bell, MonitorSmartphone, Sparkles, AudioLines } from "lucide-react";

export const metadata: Metadata = {
  title: "Download Crecoard for Desktop",
  description:
    "Get the Crecoard desktop app for Windows — native reminders, pop-out boards, live wallpapers, and the system-audio visualizer.",
};

// Set NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL (in Vercel) to the hosted installer URL.
const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ?? "";

const FEATURES = [
  { icon: Bell, title: "Native reminders", desc: "OS notifications that reach you even when the app is closed." },
  { icon: MonitorSmartphone, title: "Pop-out boards", desc: "Float a board in its own resizable window while you work." },
  { icon: Sparkles, title: "Live wallpapers", desc: "Animated board backgrounds, powered by your GPU." },
  { icon: AudioLines, title: "System-audio visualizer", desc: "Bars, rain, and particles that react to whatever's playing." },
];

export default function DownloadPage() {
  const available = Boolean(DOWNLOAD_URL);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16"
      style={{ background: "var(--surface, #0d0e11)", color: "var(--text-primary, #e7e7ea)" }}
    >
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="Crecoard" className="mb-6 h-20 w-20 rounded-2xl shadow-lg" />

        <h1 className="text-3xl font-semibold tracking-tight">Crecoard for Desktop</h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-muted, #9a9aa2)" }}>
          The full board planner as a native app — with reminders that ping you, pop-out boards, live
          wallpapers, and more.
        </p>

        {/* Download button */}
        <div className="mt-8 flex flex-col items-center gap-3">
          {available ? (
            <a
              href={DOWNLOAD_URL}
              className="flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
              style={{ background: "var(--accent, #6c63ff)" }}
            >
              <Download size={18} /> Download for Windows
            </a>
          ) : (
            <span
              className="flex items-center gap-2.5 rounded-xl border px-6 py-3.5 text-sm font-semibold"
              style={{ borderColor: "var(--border, #2a2b31)", color: "var(--text-muted, #9a9aa2)" }}
            >
              <Download size={18} /> Desktop app coming soon
            </span>
          )}
          <p className="text-[11px]" style={{ color: "var(--text-muted, #9a9aa2)" }}>
            Windows 10 &amp; 11 · free · or{" "}
            <Link href="/" className="underline hover:opacity-80">use the web app</Link>
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-12 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-1.5 rounded-xl border p-4 text-left"
              style={{ borderColor: "var(--border, #2a2b31)", background: "var(--surface-raised, #16171b)" }}
            >
              <f.icon size={18} style={{ color: "var(--accent, #6c63ff)" }} />
              <p className="text-sm font-medium">{f.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted, #9a9aa2)" }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-[11px]" style={{ color: "var(--text-muted, #9a9aa2)" }}>
          The installer is unsigned for now — Windows SmartScreen may ask you to confirm (More info → Run anyway).
        </p>
      </div>
    </main>
  );
}
