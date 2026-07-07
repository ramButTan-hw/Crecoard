// Custom animations as DATA, never code. Users compose keyframe steps from a
// whitelisted property set; the app compiles them to CSS. This is what makes
// the shared animation library safe: the worst a malicious preset can do is
// look ugly — there is no way to express selectors, urls, overlays or layout
// properties through the spec.

export interface AnimStep {
  /** Keyframe offset 0..100 (%) */
  at: number;
  opacity: number; // 0..1
  x: number;       // px, -200..200
  y: number;       // px, -200..200
  scale: number;   // 0.2..3
  rotate: number;  // deg, -360..360
}

export interface AnimSpec {
  name: string;
  steps: AnimStep[]; // 2..6, first at 0, last at 100
  duration: number;  // seconds, 0.1..10
  easing: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" | "bounce";
  loop: boolean;
  /** Loops only: reverse direction every cycle */
  alternate?: boolean;
}

const EASING_CSS: Record<AnimSpec["easing"], string> = {
  linear: "linear",
  ease: "ease",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
  bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

export const DEFAULT_STEP: AnimStep = { at: 0, opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 };

export const DEFAULT_SPEC: AnimSpec = {
  name: "My animation",
  steps: [
    { at: 0, opacity: 0, x: 0, y: 12, scale: 0.95, rotate: 0 },
    { at: 100, opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 },
  ],
  duration: 0.6,
  easing: "ease-out",
  loop: false,
};

const clamp = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : dflt;
  return Math.min(max, Math.max(min, n));
};

/** Clamp every field to the whitelist; returns null for garbage input. */
export function sanitizeSpec(raw: unknown): AnimSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<AnimSpec>;
  if (!Array.isArray(r.steps) || r.steps.length < 2) return null;
  const steps = r.steps.slice(0, 6).map((s): AnimStep => ({
    at: clamp((s as AnimStep)?.at, 0, 100, 0),
    opacity: clamp((s as AnimStep)?.opacity, 0, 1, 1),
    x: clamp((s as AnimStep)?.x, -200, 200, 0),
    y: clamp((s as AnimStep)?.y, -200, 200, 0),
    scale: clamp((s as AnimStep)?.scale, 0.2, 3, 1),
    rotate: clamp((s as AnimStep)?.rotate, -360, 360, 0),
  })).sort((a, b) => a.at - b.at);
  steps[0].at = 0;
  steps[steps.length - 1].at = 100;
  return {
    name: String(r.name ?? "Animation").slice(0, 40),
    steps,
    duration: clamp(r.duration, 0.1, 10, 0.6),
    easing: (Object.keys(EASING_CSS) as AnimSpec["easing"][]).includes(r.easing as AnimSpec["easing"]) ? (r.easing as AnimSpec["easing"]) : "ease-out",
    loop: !!r.loop,
    alternate: !!r.alternate,
  };
}

/** Stable content hash (name excluded — identical motion shares one class). */
export function specHash(spec: AnimSpec): string {
  const key = JSON.stringify([spec.steps, spec.duration, spec.easing, spec.loop, !!spec.alternate]);
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function specToCss(spec: AnimSpec, cls: string): string {
  const frames = spec.steps
    .map((s) => `${s.at}% { opacity: ${s.opacity}; transform: translate(${s.x}px, ${s.y}px) scale(${s.scale}) rotate(${s.rotate}deg); }`)
    .join("\n  ");
  const count = spec.loop ? "infinite" : "1";
  const dir = spec.loop && spec.alternate ? "alternate" : "normal";
  return `@keyframes ${cls} {\n  ${frames}\n}\n.${cls} { animation: ${cls} ${spec.duration}s ${EASING_CSS[spec.easing]} 0s ${count} ${dir} both; }`;
}

// One rule per unique spec, injected once into a registry <style> tag.
const injected = new Set<string>();

/** Compile a (possibly untrusted) spec and return its animation class. */
export function ensureAnimClass(raw: unknown): string | undefined {
  const spec = sanitizeSpec(raw);
  if (!spec || typeof document === "undefined") return undefined;
  const cls = `cr-cust-${specHash(spec)}`;
  if (!injected.has(cls)) {
    let el = document.getElementById("cr-anim-registry") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "cr-anim-registry";
      document.head.appendChild(el);
    }
    el.appendChild(document.createTextNode(specToCss(spec, cls) + "\n"));
    injected.add(cls);
  }
  return cls;
}

// Built-in presets (globals.css) — kept here so every consumer resolves
// builtin + custom animations through one helper.
export const ITEM_ANIM_CLASS: Record<string, string> = {
  fade: "cr-anim-fade", rise: "cr-anim-rise", scale: "cr-anim-scale",
  wipe: "cr-anim-wipe", pulse: "cr-anim-pulse", float: "cr-anim-float",
  glitch: "cr-anim-glitch", breathe: "cr-anim-breathe", rainbow: "cr-anim-rainbow",
};

/** Resolve an item's animation class: builtin preset name or embedded custom spec. */
export function animClassFor(preset?: string, custom?: AnimSpec): string | undefined {
  if (preset === "custom") return custom ? ensureAnimClass(custom) : undefined;
  return preset ? ITEM_ANIM_CLASS[preset] : undefined;
}
