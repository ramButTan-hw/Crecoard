"use client";

import { useRef, useState } from "react";
import { X, Plus, Trash2, Upload } from "lucide-react";
import { WallpaperEditor } from "@/components/ui/WallpaperEditor";
import { useBoardStore, useActiveBoard } from "@/store/boardStore";
import { PRESET_THEMES, BG_FILTERS, ThemeVarMap } from "@/lib/appThemes";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUser } from "@/contexts/UserContext";
import { uploadFile } from "@/lib/storage";
import { VISUALIZER_EFFECTS } from "@/components/items/VisualizerItem";

interface ThemePanelProps {
  onClose: () => void;
}

type Tab = "colors" | "background";

const COLOR_KEYS: { key: keyof ThemeVarMap; label: string }[] = [
  { key: "surface",        label: "Surface" },
  { key: "surfaceRaised",  label: "Panels" },
  { key: "surfaceOverlay", label: "Overlay" },
  { key: "sidebar",        label: "Sidebar" },
  { key: "accent",         label: "Accent" },
  { key: "accentHover",    label: "Acc. Hover" },
  { key: "border",         label: "Border" },
  { key: "textPrimary",    label: "Text" },
  { key: "textSecondary",  label: "Text 2" },
  { key: "textMuted",      label: "Muted" },
];


export function ThemePanel({ onClose }: ThemePanelProps) {
  const [tab, setTab] = useState<Tab>("colors");
  const [saveNameInput, setSaveNameInput] = useState("");
  const bgFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const isMobile = useIsMobile();
  const themeBgFileRef = useRef<HTMLInputElement>(null);

  const {
    themeVars, savedThemes, activeBoardId,
    setBoardTheme, saveCurrentTheme, deleteSavedTheme, clearBoardTheme, updateBoard,
  } = useBoardStore();
  const { identity } = useUser();
  const board = useActiveBoard();

  const currentVars: ThemeVarMap = board?.boardThemeVars ?? themeVars;
  const hasBoardTheme = !!board?.boardThemeVars;

  const upd = (patch: Parameters<typeof updateBoard>[1]) => updateBoard(activeBoardId, patch);

  const bgColor = board?.backgroundColor ?? "#1a1b1e";
  const bgOpacity = board?.backgroundOpacity ?? 1;
  const bgSize = board?.backgroundSize ?? "cover";
  const bgPosition = board?.backgroundPosition ?? "center";
  const bgFilter = board?.backgroundFilter ?? "";
  const overlayColor = board?.backgroundOverlayColor ?? "#000000";
  const overlayOpacity = board?.backgroundOverlayOpacity ?? 0;

  const themeBgColor = board?.themeBgColor ?? "#0f1014";
  const themeBgOpacity = board?.themeBgOpacity ?? 1;
  const themeBgSize = board?.themeBgSize ?? "cover";

  const handleBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      upd({ backgroundImage: dataUrl });
      void uploadFile(file, identity.userId, "themes", file.name).then((url) => {
        if (url) upd({ backgroundImage: url });
      });
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Instant preview via an object URL (no data-URL bloat in the board), then
    // swap to a persistent storage URL once the upload finishes.
    const objUrl = URL.createObjectURL(file);
    upd({ backgroundVideo: objUrl, backgroundLiveEffect: undefined });
    setVideoUploading(true);
    void uploadFile(file, identity.userId, "wallpapers", file.name)
      .then((url) => { if (url) upd({ backgroundVideo: url }); })
      .finally(() => setVideoUploading(false));
  };

  const handleThemeBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      upd({ themeBgImage: dataUrl });
      void uploadFile(file, identity.userId, "themes", file.name).then((url) => {
        if (url) upd({ themeBgImage: url });
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
    {isMobile && <div className="fixed inset-0 z-[998] bg-black/50" onClick={onClose} />}
    <div
      className={cn(
        "z-[999] border border-[var(--border)] shadow-2xl overflow-hidden",
        isMobile
          ? "fixed inset-x-0 bottom-0 w-full max-h-[85dvh] rounded-t-2xl pb-safe"
          : "fixed right-3 w-[340px] rounded-xl"
      )}
      style={isMobile ? { background: "var(--surface-raised)" } : { background: "var(--surface-raised)", top: 88 }}
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <div className="flex gap-0.5 rounded-lg bg-[var(--surface-overlay)] p-0.5">
          {(["colors", "background"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                tab === t
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {hasBoardTheme && tab === "colors" && (
            <button
              onClick={() => clearBoardTheme(activeBoardId)}
              className="text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors underline"
            >
              reset to app
            </button>
          )}
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="max-h-[min(580px,82vh)] overflow-y-auto p-3 flex flex-col gap-4">

        {/* ── COLORS TAB ────────────────────────────────────────────── */}
        {tab === "colors" && (
          <>
            <div>
              <SectionLabel>Presets</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_THEMES.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setBoardTheme(activeBoardId, preset.vars)}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    <span className="h-2.5 w-2.5 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: preset.vars.accent }} />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Colors</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {COLOR_KEYS.map(({ key, label }) => (
                  <ColorPickerRow
                    key={key}
                    label={label}
                    value={currentVars[key]}
                    onChange={(v) => setBoardTheme(activeBoardId, { ...currentVars, [key]: v })}
                  />
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Save as Preset</SectionLabel>
              <div className="flex gap-1.5">
                <input
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveNameInput.trim()) {
                      saveCurrentTheme(saveNameInput.trim(), currentVars);
                      setSaveNameInput("");
                    }
                  }}
                  placeholder="Theme name…"
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => {
                    if (saveNameInput.trim()) {
                      saveCurrentTheme(saveNameInput.trim(), currentVars);
                      setSaveNameInput("");
                    }
                  }}
                  disabled={!saveNameInput.trim()}
                  className="flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={12} /> Save
                </button>
              </div>
            </div>

            {savedThemes.length > 0 && (
              <div>
                <SectionLabel>Saved Themes</SectionLabel>
                <div className="flex flex-col gap-1">
                  {savedThemes.map((saved) => (
                    <div key={saved.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
                      <span className="h-3 w-3 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: saved.vars.accent }} />
                      <span className="flex-1 text-xs text-[var(--text-primary)] truncate">{saved.name}</span>
                      <button onClick={() => setBoardTheme(activeBoardId, saved.vars)} className="text-[11px] font-medium text-[var(--accent)] hover:underline">Apply</button>
                      <button onClick={() => deleteSavedTheme(saved.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── BACKGROUND TAB ────────────────────────────────────────── */}
        {tab === "background" && board && (
          <>
            {/* ── THEME BACKGROUND (outer — behind canvas) ── */}
            <div className="rounded-lg border border-[var(--border)] p-3 flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                Theme Background <span className="normal-case text-[var(--text-muted)] font-normal tracking-normal">· behind canvas</span>
              </p>

              <div>
                <SectionLabel>Color</SectionLabel>
                <div className="flex items-center gap-2.5">
                  <label className="relative h-8 w-12 cursor-pointer overflow-hidden rounded border border-[var(--border)]" style={{ backgroundColor: themeBgColor }}>
                    <input type="color" value={themeBgColor} onChange={(e) => upd({ themeBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </label>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{themeBgColor}</span>
                </div>
              </div>

              <div>
                <SectionLabel>Image</SectionLabel>
                <input
                  className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  placeholder="https://… paste image URL"
                  value={board.themeBgImage?.startsWith("data:") ? "" : (board.themeBgImage ?? "")}
                  onChange={(e) => upd({ themeBgImage: e.target.value || undefined })}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => themeBgFileRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    <Upload size={12} /> Upload file
                  </button>
                  {board.themeBgImage && (
                    <button onClick={() => upd({ themeBgImage: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
                <input ref={themeBgFileRef} type="file" accept="image/*" className="hidden" onChange={handleThemeBgFileUpload} />
              </div>

              {board.themeBgImage && (
                <>
                  <div>
                    <SectionLabel>Size</SectionLabel>
                    <div className="flex gap-1.5">
                      {(["cover", "contain", "auto"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => upd({ themeBgSize: s })}
                          className={cn(
                            "flex-1 rounded border py-1 text-xs capitalize transition-colors",
                            themeBgSize === s
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <SectionLabel className="mb-0">Opacity</SectionLabel>
                      <span className="text-xs text-[var(--text-muted)]">{Math.round(themeBgOpacity * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={themeBgOpacity} onChange={(e) => upd({ themeBgOpacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent)]" />
                  </div>
                </>
              )}
            </div>

            {/* ── BOARD BACKGROUND (inner — part of canvas) ── */}
            <div className="rounded-lg border border-[var(--border)] p-3 flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                Board Background <span className="normal-case text-[var(--text-muted)] font-normal tracking-normal">· moves with canvas</span>
              </p>

              <div>
                <SectionLabel>Live Wallpaper</SectionLabel>
                <select
                  value={board.backgroundLiveEffect ?? ""}
                  onChange={(e) => upd({ backgroundLiveEffect: e.target.value || undefined, backgroundVideo: e.target.value ? undefined : board.backgroundVideo })}
                  className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">None (static background)</option>
                  {VISUALIZER_EFFECTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
                {board.backgroundLiveEffect && (
                  <div className="mb-1.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>Colors</span>
                    <input type="color" value={board.backgroundLiveColor || "#d59ee8"} onChange={(e) => upd({ backgroundLiveColor: e.target.value })} className="h-6 w-8 cursor-pointer rounded border-0 p-0" />
                    <input type="color" value={board.backgroundLiveColor2 || "#48cfa6"} onChange={(e) => upd({ backgroundLiveColor2: e.target.value })} className="h-6 w-8 cursor-pointer rounded border-0 p-0" />
                  </div>
                )}
                <div className="mb-1 flex gap-1.5">
                  <button
                    onClick={() => videoFileRef.current?.click()}
                    disabled={videoUploading}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
                  >
                    <Upload size={12} /> {videoUploading ? "Uploading…" : board.backgroundVideo ? "Replace video" : "Upload video (.mp4/.webm)"}
                  </button>
                  {board.backgroundVideo && (
                    <button onClick={() => upd({ backgroundVideo: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
                <input ref={videoFileRef} type="file" accept="video/mp4,video/webm,video/*" className="hidden" onChange={handleVideoUpload} />
                <p className="text-[10px] text-[var(--text-muted)]">A live wallpaper replaces the static color/image below.</p>
              </div>

              <div>
                <SectionLabel>Color</SectionLabel>
                <div className="flex items-center gap-2.5">
                  <label className="relative h-8 w-12 cursor-pointer overflow-hidden rounded border border-[var(--border)]" style={{ backgroundColor: bgColor }}>
                    <input type="color" value={bgColor} onChange={(e) => upd({ backgroundColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </label>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{bgColor}</span>
                </div>
              </div>

              <div>
                <SectionLabel>Wallpaper Image</SectionLabel>
                <input
                  className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  placeholder="https://… paste image URL"
                  value={board.backgroundImage?.startsWith("data:") ? "" : (board.backgroundImage ?? "")}
                  onChange={(e) => upd({ backgroundImage: e.target.value || undefined })}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => bgFileRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    <Upload size={12} /> Upload file
                  </button>
                  {board.backgroundImage && (
                    <button onClick={() => upd({ backgroundImage: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
                <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgFileUpload} />
              </div>

              {board.backgroundImage && (
                <>
                  <WallpaperEditor
                    url={board.backgroundImage}
                    size={bgSize}
                    position={bgPosition}
                    opacity={bgOpacity}
                    backgroundColor={bgColor}
                    onSizeChange={(v) => upd({ backgroundSize: v })}
                    onPositionChange={(v) => upd({ backgroundPosition: v })}
                    onOpacityChange={(v) => upd({ backgroundOpacity: v })}
                  />

                  <div>
                    <SectionLabel>Filter</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {BG_FILTERS.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => upd({ backgroundFilter: f.value })}
                          className={cn(
                            "rounded border px-2.5 py-1 text-xs transition-colors",
                            bgFilter === f.value
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Color Tint</SectionLabel>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--text-muted)] transition-colors">
                      <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: overlayColor }}>
                        <input type="color" value={overlayColor} onChange={(e) => upd({ backgroundOverlayColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                      </span>
                      <span className="flex-1 text-xs text-[var(--text-secondary)]">Tint color</span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">{overlayColor}</span>
                    </label>
                    <div className="mt-1.5">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-muted)]">Intensity</span>
                        <span className="text-xs text-[var(--text-muted)]">{Math.round(overlayOpacity * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.01} value={overlayOpacity} onChange={(e) => upd({ backgroundOverlayOpacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent)]" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]", className)}>
      {children}
    </p>
  );
}

function ColorPickerRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 hover:border-[var(--text-muted)] transition-colors">
      <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 shadow-sm overflow-hidden" style={{ backgroundColor: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </span>
      <span className="flex-1 text-xs text-[var(--text-secondary)] truncate">{label}</span>
      <span className="font-mono text-[11px] text-[var(--text-muted)] flex-shrink-0">{value}</span>
    </label>
  );
}
