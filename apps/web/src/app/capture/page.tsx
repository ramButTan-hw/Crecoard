"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createReminder } from "@/lib/reminders";

// Quick-capture popup (desktop app, Ctrl/Cmd+Shift+Space). Jot a reminder from
// any app; it creates the reminder and the Electron window closes itself.

type Status = "idle" | "saving" | "saved" | "error" | "noauth";

const TIME_OPTIONS: { label: string; at: () => Date }[] = [
  { label: "In 1 hour", at: () => new Date(Date.now() + 60 * 60_000) },
  {
    label: "This evening",
    at: () => {
      const d = new Date();
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: "Tomorrow 9am",
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

const close = () => {
  if (typeof window !== "undefined") window.electron?.closeCapture?.();
};

export default function CapturePage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Surface a sign-in hint up front if there's no session.
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) setStatus("noauth");
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = async (at: Date) => {
    const title = text.trim();
    if (!title || status === "saving" || status === "saved") return;
    setStatus("saving");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("noauth"); return; }
    const res = await createReminder({
      userId: user.id,
      title,
      remindAt: at,
      url: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (res.ok) {
      setStatus("saved");
      setTimeout(close, 700);
    } else {
      setStatus("error");
    }
  };

  const dragCss = { WebkitAppRegion: "drag" } as React.CSSProperties;
  const noDragCss = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  return (
    <div
      className="flex h-screen w-screen flex-col gap-3 p-4 select-none"
      style={{ background: "var(--surface-raised, #16171b)", color: "var(--text-primary, #e7e7ea)", ...dragCss }}
    >
      <div className="flex items-center justify-between" style={dragCss}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted, #9a9aa2)" }}>
          Quick capture
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted, #9a9aa2)" }}>Esc to close</span>
      </div>

      {status === "noauth" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm">Sign in to Crecoard first</p>
          <p className="text-xs" style={{ color: "var(--text-muted, #9a9aa2)" }}>Open the app from the tray, sign in, then try again.</p>
        </div>
      ) : status === "saved" ? (
        <div className="flex flex-1 items-center justify-center text-sm font-medium" style={{ color: "#4ade80" }}>
          ✓ Reminder saved
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => { setText(e.target.value); if (status === "error") setStatus("idle"); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(TIME_OPTIONS[0].at()); }}
            placeholder="Remind me to…"
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
            style={{ ...noDragCss, background: "var(--surface, #0d0e11)", borderColor: "var(--border, #2a2b31)", color: "var(--text-primary, #e7e7ea)" }}
          />

          <div className="flex items-center gap-1.5" style={noDragCss}>
            {TIME_OPTIONS.map((o) => (
              <button
                key={o.label}
                disabled={!text.trim() || status === "saving"}
                onClick={() => submit(o.at())}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                style={{ borderColor: "var(--border, #2a2b31)", color: "var(--text-secondary, #b8b8c0)" }}
              >
                {o.label}
              </button>
            ))}
            <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted, #9a9aa2)" }}>
              {status === "error" ? "Couldn't save — try again" : "Enter = in 1 hour"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
