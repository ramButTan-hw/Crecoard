"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useActiveBoard } from "@/store/boardStore";

// A one-time, guided tour for brand-new users. Spotlights a real UI element
// (dims everything else) with a small tooltip. Two steps are HANDS-ON — the user
// actually right-clicks and adds a block, and the tour auto-advances — while
// every step keeps a Skip (exit) and Next (bypass) so no one gets stuck.
// Shown once (localStorage). Rendered only on the personal board.

const KEY = "crecoard-tour-done";
const REPLAY_EVENT = "crecoard:replay-tour";

/** Restart the first-run tour on demand (e.g. from Settings → About). */
export function replayFirstRunTour() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT));
}

interface Step {
  target?: string;
  title: string;
  body: string;
  /** Hands-on steps let the user interact with the app and auto-advance. */
  interactive?: "contextmenu" | "boxAdded";
}

const STEPS: Step[] = [
  { target: '[data-tour="palette"]', title: "Everything starts here", body: "Click an item to drop it on your board — or drag it where you want it. Try a List or Text to begin." },
  { target: '[data-board-canvas]', title: "This is your board", body: "Items live here. Drag to move them, grab an edge to resize, and scroll or pinch to zoom around." },
  { target: '[data-board-canvas]', title: "Right-click the board", body: "Try it now — right-click anywhere on the board to open the quick menu. (Or click Next.)", interactive: "contextmenu" },
  { target: '[data-board-canvas]', title: "Add a block", body: "In that menu, choose “Add block here”. Blocks are containers — drag items inside to group them. (Or click Next.)", interactive: "boxAdded" },
  { target: '[data-theme-btn]', title: "Make it yours", body: "Style the board from here — a background image or color, accent, fonts, and grid. Give it a vibe." },
  { title: "That's the whole idea 🎉", body: "Mix items freely, and press ⌘K anytime to add anything fast. There's no wrong way to build a board — have fun." },
];

export function FirstRunTour() {
  const board = useActiveBoard();
  const boxCount = board?.boxes.length ?? 0;

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const boxAtStepStart = useRef(0);

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  useEffect(() => {
    if (typeof window === "undefined" || localStorage.getItem(KEY) === "1") return;
    const t = window.setTimeout(() => setActive(true), 900); // let the board mount first
    return () => window.clearTimeout(t);
  }, []);

  // Let "Replay guided tour" (Settings) restart it on demand.
  useEffect(() => {
    const onReplay = () => { setStep(0); setActive(true); };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  const measure = useCallback(() => {
    const sel = STEPS[step]?.target;
    if (!sel) { setRect(null); return; }
    const el = document.querySelector(sel);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, measure]);

  const next = useCallback(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), []);
  const finish = useCallback(() => {
    try { localStorage.setItem(KEY, "1"); } catch { /* storage unavailable */ }
    setActive(false);
  }, []);

  // Snapshot the block count when a "boxAdded" step begins.
  useEffect(() => {
    if (active && STEPS[step]?.interactive === "boxAdded") boxAtStepStart.current = boxCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  // Auto-advance when the user actually adds a block.
  useEffect(() => {
    if (!active || s?.interactive !== "boxAdded") return;
    if (boxCount > boxAtStepStart.current) next();
  }, [active, s, boxCount, next]);

  // Auto-advance when the user right-clicks the board (let the menu open first).
  useEffect(() => {
    if (!active || s?.interactive !== "contextmenu") return;
    const onCtx = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("[data-board-canvas]")) window.setTimeout(next, 400);
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, [active, s, next]);

  if (!active || typeof document === "undefined") return null;

  // Tooltip placement: prefer beside/below/above the target, but ALWAYS keep the
  // whole box on-screen. A target that fills the viewport (e.g. the board canvas)
  // has no room around it, so we center the tooltip instead of pushing it (and its
  // Next button) off the bottom edge.
  const W = 300;
  const H = 200; // approx tooltip height, for placement math
  const pad = 14;
  const clampL = (l: number) => Math.min(Math.max(pad, l), window.innerWidth - W - pad);
  const clampT = (t: number) => Math.min(Math.max(pad, t), window.innerHeight - H - pad);
  const center: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  let tip: React.CSSProperties = center;
  if (rect) {
    if (rect.right + pad + W <= window.innerWidth) {
      tip = { left: rect.right + pad, top: clampT(rect.top) };
    } else if (rect.bottom + pad + H <= window.innerHeight) {
      tip = { left: clampL(rect.left), top: rect.bottom + pad };
    } else if (rect.top - pad - H >= 0) {
      tip = { left: clampL(rect.left), top: rect.top - pad - H };
    } else {
      tip = center; // target fills the screen — keep the tooltip centered & visible
    }
  }

  const handsOn = !!s.interactive;

  return createPortal(
    // Hands-on steps let interaction pass through to the app; guided steps block it.
    <div className="fixed inset-0 z-[10050]" style={{ pointerEvents: handsOn ? "none" : "auto" }}>
      {rect ? (
        <div
          aria-hidden
          style={{
            position: "fixed", left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12,
            borderRadius: 12, boxShadow: `0 0 0 9999px rgba(0,0,0,${handsOn ? 0.42 : 0.62})`,
            border: "2px solid var(--accent, #6c63ff)", pointerEvents: "none",
            transition: "left 0.25s, top 0.25s, width 0.25s, height 0.25s",
          }}
        />
      ) : (
        <div aria-hidden style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", pointerEvents: "none" }} />
      )}

      <div
        style={{
          position: "fixed", width: W, ...tip, pointerEvents: "auto",
          background: "var(--surface-raised, #16171b)", border: "1px solid var(--border, #2a2b31)",
          borderRadius: 14, padding: 16, boxShadow: "0 14px 44px rgba(0,0,0,0.55)", color: "var(--text-primary, #e7e7ea)",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {handsOn && <span style={{ color: "var(--accent, #6c63ff)" }}>Try it · </span>}{s.title}
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-muted, #9a9aa2)", margin: "7px 0 15px" }}>{s.body}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted, #9a9aa2)" }}>{step + 1} / {STEPS.length}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={finish} style={{ fontSize: 12, color: "var(--text-muted, #9a9aa2)", background: "none", border: "none", cursor: "pointer" }}>
              Skip tour
            </button>
            <button
              onClick={() => (last ? finish() : next())}
              style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--accent, #6c63ff)", border: "none", borderRadius: 8, padding: "6px 15px", cursor: "pointer" }}
            >
              {last ? "Start building" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
