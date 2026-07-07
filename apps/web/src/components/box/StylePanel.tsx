"use client";

import { useRef, useState } from "react";
import { X, ChevronDown, ChevronRight, Code2, Maximize2, Upload } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { useBoardStore, BoxStyle } from "@/store/boardStore";
import { WallpaperEditor } from "@/components/ui/WallpaperEditor";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { uploadFile } from "@/lib/storage";

interface StylePanelProps { boxId: string }

export function StylePanel({ boxId }: StylePanelProps) {
  const { boards, activeBoardId, updateBoxStyle, updateBox, selectBox, setExpandedBox } = useBoardStore();
  const { identity } = useUser();
  const box = boards.find((b) => b.id === activeBoardId)?.boxes.find((b) => b.id === boxId);
  const [expertMode, setExpertMode] = useState(false);
  const [openSection, setOpenSection] = useState("wallpaper");
  const [colorPicker, setColorPicker] = useState<"bg" | "border" | "font" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!box) return null;
  const s = box.style;
  const upd = (p: Partial<BoxStyle>) => updateBoxStyle(activeBoardId, boxId, p);
  const toggle = (k: string) => setOpenSection((v) => (v === k ? "" : k));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      upd({ wallpaperUrl: dataUrl });
      void uploadFile(file, identity.userId, "wallpapers", file.name).then((url) => {
        if (url) upd({ wallpaperUrl: url });
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex w-[268px] flex-shrink-0 flex-col overflow-hidden border-l border-[var(--border)]" style={{ background: "var(--surface-raised)" }}>
      {/* Header */}
      <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-4">
        <input
          className="bg-transparent text-sm font-medium text-[var(--text-primary)] outline-none w-28"
          value={box.title}
          onChange={(e) => updateBox(activeBoardId, boxId, { title: e.target.value })}
          placeholder="Block title"
        />
        <div className="flex items-center gap-1">
          <button onClick={() => setExpandedBox(boxId)} className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors" title="Expand block">
            <Maximize2 size={14} />
          </button>
          <button onClick={() => setExpertMode((v) => !v)} className={cn("rounded p-1.5 transition-colors", expertMode ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]")} title="Expert mode">
            <Code2 size={14} />
          </button>
          <button onClick={() => selectBox(null)} className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Items count row — hidden for decks */}
      {!box.isDeck && (
        <div className="border-b border-[var(--border)] px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{box.items.length} item{box.items.length !== 1 ? "s" : ""} · {box.items.filter((i) => i.showInCollapsed).length} in summary</span>
          <button onClick={() => setExpandedBox(boxId)} className="ml-auto text-xs text-[var(--accent)] hover:underline">Manage →</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {box.isDeck ? (
          <DeckStylePanel box={box} boardId={activeBoardId} />
        ) : expertMode ? (
          <ExpertPanel box={box} boardId={activeBoardId} />
        ) : (
          <>
            <Section title="Wallpaper" open={openSection === "wallpaper"} onToggle={() => toggle("wallpaper")}>
              <div className="px-4 pb-1 pt-0.5 flex flex-col gap-1.5">
                <label className="text-[11px] text-[var(--text-muted)]">Image URL</label>
                <input
                  className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  placeholder="https://…"
                  value={s.wallpaperUrl.startsWith("data:") ? "" : s.wallpaperUrl}
                  onChange={(e) => upd({ wallpaperUrl: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    <Upload size={12} /> Upload file
                  </button>
                  {s.wallpaperUrl && (
                    <button onClick={() => upd({ wallpaperUrl: "" })} className="rounded border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </div>

              {!s.wallpaperUrl && (
                <>
                  <Row label="Color"><ColorSwatch color={s.backgroundColor} open={colorPicker === "bg"} onToggle={() => setColorPicker((v) => (v === "bg" ? null : "bg"))} onChange={(c) => upd({ backgroundColor: c })} /></Row>
                  <Row label="Opacity">
                    <div className="flex flex-1 items-center gap-2">
                      <input type="range" min={0} max={1} step={0.01} value={s.wallpaperOpacity} onChange={(e) => upd({ wallpaperOpacity: parseFloat(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                      <span className="w-9 text-right text-xs text-[var(--text-muted)]">{Math.round(s.wallpaperOpacity * 100)}%</span>
                    </div>
                  </Row>
                </>
              )}

              {s.wallpaperUrl && (
                <div className="px-4 pb-2">
                  <WallpaperEditor
                    url={s.wallpaperUrl}
                    size={s.wallpaperSize ?? "cover"}
                    position={s.wallpaperPosition ?? "center"}
                    opacity={s.wallpaperOpacity}
                    backgroundColor={s.backgroundColor}
                    onSizeChange={(v) => upd({ wallpaperSize: v })}
                    onPositionChange={(v) => upd({ wallpaperPosition: v })}
                    onOpacityChange={(v) => upd({ wallpaperOpacity: v })}
                  />
                </div>
              )}
            </Section>

            <Section title="Border" open={openSection === "border"} onToggle={() => toggle("border")}>
              <Row label="Color"><ColorSwatch color={s.borderColor} open={colorPicker === "border"} onToggle={() => setColorPicker((v) => (v === "border" ? null : "border"))} onChange={(c) => upd({ borderColor: c })} /></Row>
              <Row label="Width"><NumberInput value={s.borderWidth} min={0} max={24} onChange={(v) => upd({ borderWidth: v })} suffix="px" /></Row>
              <Row label="Radius"><NumberInput value={s.borderRadius} min={0} max={200} onChange={(v) => upd({ borderRadius: v })} suffix="px" /></Row>
              <div className="px-4 pb-2">
                <p className="mb-2 text-[11px] text-[var(--text-muted)]">Style</p>
                <BorderStylePicker
                  value={s.borderStyle}
                  color={s.borderColor}
                  width={s.borderWidth}
                  onChange={(v) => upd({ borderStyle: v as BoxStyle["borderStyle"] })}
                />
                {s.borderStyle === "glow" && (
                  <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={!!s.glowAnimate} onChange={(e) => upd({ glowAnimate: e.target.checked })} className="accent-[var(--accent)]" />
                    Animate glow
                  </label>
                )}
              </div>
            </Section>

            <Section title="Shadow" open={openSection === "shadow"} onToggle={() => toggle("shadow")}>
              <div className="flex gap-2 px-4 pb-3">
                {(["none", "sm", "md", "lg"] as const).map((sh) => (
                  <button key={sh} onClick={() => upd({ shadow: sh })} className={cn("flex-1 rounded border py-1.5 text-xs transition-colors", s.shadow === sh ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]")}>{sh}</button>
                ))}
              </div>
            </Section>

            <Section title="Spacing" open={openSection === "spacing"} onToggle={() => toggle("spacing")}>
              <Row label="Padding"><NumberInput value={s.padding} min={0} max={64} onChange={(v) => upd({ padding: v })} suffix="px" /></Row>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Border style picker ──────────────────────────────────────────────────────

const BORDER_STYLES: { id: string; label: string }[] = [
  { id: "solid",  label: "Solid"  },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "double", label: "Double" },
  { id: "groove", label: "Groove" },
  { id: "ridge",  label: "Ridge"  },
  { id: "inset",  label: "Inset"  },
  { id: "outset", label: "Outset" },
  { id: "glow",   label: "Glow"   },
  { id: "none",   label: "None"   },
];

function BorderStylePicker({ value, color, width, onChange }: {
  value: string;
  color: string;
  width: number;
  onChange: (v: string) => void;
}) {
  const w = Math.max(1, Math.min(width, 6)); // clamp preview thickness
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {BORDER_STYLES.map((bs) => {
        const isGlow = bs.id === "glow";
        const isNone = bs.id === "none";
        const previewBorder = isGlow || isNone ? "none" : `${w}px ${bs.id} ${color}`;
        const previewShadow = isGlow ? `0 0 6px 2px ${color}` : undefined;
        const active = value === bs.id;
        return (
          <button
            key={bs.id}
            onClick={() => onChange(bs.id)}
            title={bs.label}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all",
              active ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-overlay)]"
            )}
          >
            {/* Preview box */}
            <div
              className="w-full rounded"
              style={{
                height: 22,
                border: previewBorder,
                boxShadow: previewShadow,
                background: isNone ? "repeating-linear-gradient(45deg,var(--border) 0,var(--border) 1px,transparent 0,transparent 50%) 0/6px 6px" : "transparent",
              }}
            />
            <span className={cn("text-[10px] leading-none", active ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
              {bs.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DeckStylePanel({ box, boardId }: { box: any; boardId: string }) {
  const { updateBox } = useBoardStore();
  const upd = (p: object) => updateBox(boardId, box.id, p);
  const [openSec, setOpenSec] = useState("behaviour");
  const toggle = (k: string) => setOpenSec(v => v === k ? "" : k);

  const transition = box.deckTransition ?? "slide";
  const layout = box.deckLayout ?? "centered";
  const autoPlay = box.deckAutoPlay ?? true;
  const autoMs = box.deckAutoPlayMs ?? 3500;
  const showArrows = box.deckShowArrows ?? true;
  const showDots = box.deckShowDots ?? true;
  const showPeek = box.deckShowPeek ?? true;
  const peekScale = box.deckPeekScale ?? 0.82;
  const peekOpacity = box.deckPeekOpacity ?? 0.5;
  const peekBlur = box.deckPeekBlur ?? false;

  const TRANSITIONS = [
    { id: "slide", label: "Slide", desc: "Glides left / right" },
    { id: "fade", label: "Fade", desc: "Cross-fades in place" },
    { id: "scale", label: "Scale", desc: "Zooms in from center" },
    { id: "flip", label: "Flip", desc: "3-D card rotation" },
  ] as const;

  const LAYOUTS = [
    { id: "centered", label: "Centered", desc: "Side slides peek in, scaled down" },
    { id: "flat", label: "Flat", desc: "Side slides at full scale" },
    { id: "stack", label: "Stack", desc: "Cards stack with depth shadow" },
  ] as const;

  return (
    <div className="flex flex-col">
      {/* Transition type */}
      <Section title="Transition" open={openSec === "transition"} onToggle={() => toggle("transition")}>
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {TRANSITIONS.map(t => (
            <button key={t.id} onClick={() => upd({ deckTransition: t.id })}
              className={cn("flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors",
                transition === t.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--accent)]/50")}>
              <span className="text-xs font-semibold text-[var(--text-primary)]">{t.label}</span>
              <span className="text-[11px] text-[var(--text-muted)] mt-0.5">{t.desc}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Layout */}
      <Section title="Layout" open={openSec === "layout"} onToggle={() => toggle("layout")}>
        <div className="px-4 pb-3 flex flex-col gap-2">
          {LAYOUTS.map(l => (
            <button key={l.id} onClick={() => upd({ deckLayout: l.id })}
              className={cn("flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                layout === l.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--accent)]/50")}>
              <span className="text-xs font-semibold text-[var(--text-primary)] w-16 shrink-0">{l.label}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{l.desc}</span>
            </button>
          ))}

          {showPeek && layout !== "flat" && (
            <div className="mt-1 flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3">
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Side slides</p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] w-14 shrink-0">Scale</span>
                <input type="range" min={0.5} max={1} step={0.01} value={peekScale}
                  onChange={e => upd({ deckPeekScale: Number(e.target.value) })}
                  className="flex-1" />
                <span className="text-[11px] text-[var(--text-muted)] w-8 text-right">{Math.round(peekScale * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] w-14 shrink-0">Opacity</span>
                <input type="range" min={0} max={1} step={0.01} value={peekOpacity}
                  onChange={e => upd({ deckPeekOpacity: Number(e.target.value) })}
                  className="flex-1" />
                <span className="text-[11px] text-[var(--text-muted)] w-8 text-right">{Math.round(peekOpacity * 100)}%</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={peekBlur} onChange={e => upd({ deckPeekBlur: e.target.checked })} className="rounded" />
                <span className="text-[11px] text-[var(--text-muted)]">Blur side slides</span>
              </label>
            </div>
          )}
        </div>
      </Section>

      {/* Behaviour */}
      <Section title="Behaviour" open={openSec === "behaviour"} onToggle={() => toggle("behaviour")}>
        <div className="px-4 pb-3 flex flex-col gap-2.5">
          <Toggle label="Auto-play" value={autoPlay} onChange={v => upd({ deckAutoPlay: v })} />
          {autoPlay && (
            <div className="flex items-center gap-2 pl-0">
              <span className="text-[11px] text-[var(--text-muted)] w-12 shrink-0">Speed</span>
              <input type="range" min={1000} max={8000} step={500} value={autoMs}
                onChange={e => upd({ deckAutoPlayMs: Number(e.target.value) })}
                className="min-w-0 flex-1" />
              <span className="text-[11px] text-[var(--text-muted)] w-8 shrink-0 text-right">{(autoMs / 1000).toFixed(1)}s</span>
            </div>
          )}
          <Toggle label="Show arrows"      value={showArrows} onChange={v => upd({ deckShowArrows: v })} />
          <Toggle label="Show dots"        value={showDots}   onChange={v => upd({ deckShowDots: v })} />
          <Toggle label="Show side slides" value={showPeek}   onChange={v => upd({ deckShowPeek: v })} />
        </div>
      </Section>
    </div>
  );
}

function ExpertPanel({ box, boardId }: { box: any; boardId: string }) {
  const { updateBoxStyle } = useBoardStore();
  const [css, setCss] = useState(box.style.customCss ?? "");
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs text-[var(--text-muted)]">Inject custom CSS and inspect raw style JSON.</p>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--text-secondary)]">Custom CSS</label>
        <textarea className="min-h-[140px] rounded border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-xs text-[var(--text-primary)] outline-none resize-y" placeholder={"/* inject any CSS */\nborder: 2px solid red;\n"} value={css} onChange={(e) => setCss(e.target.value)} onBlur={() => updateBoxStyle(boardId, box.id, { customCss: css })} />
      </div>
      <pre className="overflow-auto rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-[11px] text-[var(--text-muted)] max-h-[200px]">{JSON.stringify(box.style, null, 2)}</pre>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", value ? "bg-[var(--accent)]" : "bg-[var(--border)]")}
        role="switch"
        aria-checked={value}
      >
        <span
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: value ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border)]">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
        {title} {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5">
      <span className="w-14 flex-shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  );
}

function NumberInput({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex flex-1 items-center gap-1">
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none" />
      {suffix && <span className="text-xs text-[var(--text-muted)]">{suffix}</span>}
    </div>
  );
}

function ColorSwatch({ color, open, onToggle, onChange }: { color: string; open: boolean; onToggle: () => void; onChange: (c: string) => void }) {
  return (
    <div className="relative flex items-center gap-2">
      <button onClick={onToggle} className="h-6 w-6 rounded border border-[var(--border)] flex-shrink-0" style={{ backgroundColor: color }} />
      <input className="w-24 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none uppercase" value={color} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      {open && <div className="absolute top-8 left-0 z-50 rounded-lg border border-[var(--border)] shadow-xl overflow-hidden"><HexColorPicker color={color} onChange={onChange} /></div>}
    </div>
  );
}

