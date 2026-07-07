"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/UserContext";
import { fetchDueReminders } from "@/lib/reminders";
import { appToast } from "@/components/ui/AppToast";

const POLL_MS = 30_000;
const SHOWN_KEY = "crecoard-notified-reminders";
const SHOWN_CAP = 500; // keep the dedupe ledger bounded

function loadShown(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveShown(set: Set<string>) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(set).slice(-SHOWN_CAP)));
  } catch {
    /* storage full / unavailable — dedupe simply resets */
  }
}

// Short two-tone chime via Web Audio (no asset needed). Best-effort: browsers
// gate audio until a user gesture, so this reliably sounds from the test button
// and once the user has interacted with the app.
let audioCtx: AudioContext | null = null;
function playChime() {
  try {
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx ?? new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const now = audioCtx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.14;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  } catch {
    /* audio blocked or unavailable */
  }
}

/**
 * Surface one reminder to the user through every channel available right now:
 *  - a native OS toast when running in the desktop app (shows even when the
 *    window is backgrounded);
 *  - an in-app toast + chime, which always works whenever the app is open —
 *    a reliable fallback when OS notifications are suppressed (Focus Assist,
 *    per-app notifications off, or an unrestarted dev build without the bridge).
 */
function surfaceReminder(title: string, body: string, url?: string) {
  const t = title || "Reminder";
  window.electron?.notify?.({ title: t, body, url });
  appToast(`Reminder: ${t}${body ? ` — ${body}` : ""}`, "info");
  playChime();
}

/** Fire a sample reminder now — wired to the "Send test notification" button. */
export function testReminderNotification() {
  surfaceReminder("Test reminder", "If you can see or hear this, reminders are working.");
}

/**
 * Reminder pinger. While the user is signed in and the app is open, it polls
 * their due reminders and surfaces each exactly once per device. This is a
 * *local* surfacing channel, independent of the server's email/web-push
 * delivery (a reminder can both email and ping) — so dedupe lives in
 * localStorage, never in the row's delivery status.
 */
export function DesktopReminders() {
  const { identity, isLoggedIn } = useUser();
  const router = useRouter();
  const shownRef = useRef<Set<string> | null>(null);

  // Poll for due reminders → surface (native toast + in-app toast + chime).
  useEffect(() => {
    if (!isLoggedIn || !identity.userId) return;

    if (!shownRef.current) shownRef.current = loadShown();
    let cancelled = false;

    const tick = async () => {
      const due = await fetchDueReminders(identity.userId).catch(() => []);
      const shown = shownRef.current;
      if (cancelled || !shown) return;
      let changed = false;
      for (const r of due) {
        if (shown.has(r.id)) continue;
        shown.add(r.id);
        changed = true;
        surfaceReminder(r.title || "Reminder", r.body || "", r.url ?? undefined);
      }
      if (changed) saveShown(shown);
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [identity.userId, isLoggedIn]);

  // Clicking a native toast focuses the app — route to the reminder's board.
  useEffect(() => {
    const subscribe = typeof window !== "undefined" ? window.electron?.onReminderClick : undefined;
    if (!subscribe) return;
    return subscribe((url) => {
      try {
        const u = new URL(url, window.location.origin);
        if (u.origin === window.location.origin) router.push(u.pathname + u.search);
        else window.location.href = url;
      } catch {
        /* malformed url — ignore */
      }
    });
  }, [router]);

  return null;
}
