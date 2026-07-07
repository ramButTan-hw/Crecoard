"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Pencil, Smile, Plus, GripVertical, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type SelfIdentity, type ProfileBlock, type ProfileBlockItem,
  type FontFamily, type LineHeight, type LetterSpacing,
} from "@/lib/collaboration";
import { useUser } from "@/contexts/UserContext";
import { ImageCropModal } from "./ImageCropModal";
import { uploadDataUrl } from "@/lib/storage";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_PRESETS = [
  { emoji: "🎯", text: "Focused" }, { emoji: "💡", text: "Brainstorming" },
  { emoji: "🎧", text: "In the zone" }, { emoji: "☕", text: "Be right back" },
  { emoji: "🌙", text: "Do not disturb" }, { emoji: "🏖️", text: "On vacation" },
];
const BLOCK_COLORS = [
  "#1e2d5a","#2a1f4a","#3a1530","#0d2b3a","#2d2000","#0d2a1a","#1a1b1e","#2a0d0e",
];
const BOARD_BG_COLORS = [
  "#111216","#0a0f1e","#0a1a0a","#1a0a0a","#0d0a1a","#1a0a1a","#1a1200","#0a1418",
];
const TEXT_COLORS = [
  "rgba(255,255,255,0.95)", "rgba(255,255,255,0.65)", "rgba(255,255,255,0.35)",
  "#57f287", "#fee75c", "#d59ee8", "#eb459e", "#ff7878",
  "#00b0f4", "#ff9f43", "#a29bfe", "#00cec9",
];
const FONT_FAMILIES: { key: FontFamily; label: string; css: string }[] = [
  { key: "sans",  label: "Sans",  css: "inherit" },
  { key: "serif", label: "Serif", css: "Georgia, serif" },
  { key: "mono",  label: "Mono",  css: "'Courier New', monospace" },
  { key: "hand",  label: "Hand",  css: "cursive" },
];
const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;
const FONT_WEIGHT_LABELS: Record<number, string> = { 300: "Li", 400: "Rg", 500: "Md", 600: "Sb", 700: "Bd", 800: "Xb" };

const BLOCK_W = 180, BLOCK_H = 120, MAX_BLOCKS = 6;

const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  sans: "inherit",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', Consolas, monospace",
  hand: "cursive",
};
const LINE_HEIGHT_MAP: Record<LineHeight, number> = { tight: 1.2, normal: 1.5, relaxed: 1.85 };
const LETTER_SPACING_MAP: Record<LetterSpacing, string> = { normal: "0em", wide: "0.06em", wider: "0.14em" };

type TextItem = Extract<ProfileBlockItem, { type: "text" }>;
type ListItem = Extract<ProfileBlockItem, { type: "list" }>;

function makeBlock(idx: number): ProfileBlock {
  return {
    id: crypto.randomUUID(),
    color: BLOCK_COLORS[idx % BLOCK_COLORS.length],
    x: 16 + (idx % 3) * (BLOCK_W + 16),
    y: 16 + Math.floor(idx / 3) * (BLOCK_H + 16),
    w: BLOCK_W, h: BLOCK_H,
    items: [],
  };
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase() || "?";
}


// ── Main modal ─────────────────────────────────────────────────────────────────

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { identity, updateProfile } = useUser();
  const [draft, setDraft] = useState<SelfIdentity>(() => identity);
  const [profileBlocks, setProfileBlocks] = useState<ProfileBlock[]>(
    () => identity.profileBoard?.blocks ?? []
  );
  const [boardBg, setBoardBg] = useState<string>(
    () => identity.profileBoard?.bg ?? "#111216"
  );
  const [boardBgImage, setBoardBgImage] = useState<string | undefined>(
    () => identity.profileBoard?.bgImage
  );
  const boardBgImageRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ src: string; field: "avatarUrl" | "bannerUrl" } | null>(null);

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const upload = (field: "avatarUrl" | "bannerUrl", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropTarget({ src: ev.target?.result as string, field });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    let finalDraft = { ...draft };
    if (finalDraft.avatarUrl?.startsWith("data:")) {
      const url = await uploadDataUrl(finalDraft.avatarUrl, identity.userId, "avatars", "avatar.png");
      if (url) finalDraft = { ...finalDraft, avatarUrl: url };
    }
    if (finalDraft.bannerUrl?.startsWith("data:")) {
      const url = await uploadDataUrl(finalDraft.bannerUrl, identity.userId, "banners", "banner.png");
      if (url) finalDraft = { ...finalDraft, bannerUrl: url };
    }
    let finalBgImage = boardBgImage;
    if (boardBgImage?.startsWith("data:")) {
      const url = await uploadDataUrl(boardBgImage, identity.userId, "boards", "bg.png");
      if (url) finalBgImage = url;
    }
    void updateProfile({
      ...finalDraft,
      displayName: finalDraft.displayName || "Anonymous",
      profileBoard: { blocks: profileBlocks, bg: boardBg, bgImage: finalBgImage },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  const bannerGradient = `linear-gradient(135deg, ${draft.color}88 0%, ${draft.color}22 100%)`;

  return (
    <>
      <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed z-[1001] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-[var(--border)]"
        style={{ background: "var(--surface-raised)", width: "min(90vw, 1100px)", height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div
          className="relative flex-shrink-0 group cursor-pointer"
          style={{
            height: "min(300px, 25vh)",
            background: draft.bannerUrl ? undefined : bannerGradient,
            backgroundImage: draft.bannerUrl ? `url(${draft.bannerUrl})` : undefined,
            backgroundSize: draft.bannerUrl ? "cover" : undefined,
            backgroundPosition: "center",
          }}
          onClick={() => bannerFileRef.current?.click()}
        >
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors pointer-events-none">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-white text-sm font-medium bg-black/40 rounded-lg px-3 py-1.5">
              <Camera size={14} /> Change Banner
            </span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute top-3 right-3 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/75 transition-colors z-10">
            <X size={14} />
          </button>
          {draft.bannerUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); setDraft((d) => ({ ...d, bannerUrl: undefined })); }}
              className="absolute top-3 right-12 rounded-lg bg-black/50 px-2.5 py-1 text-white text-xs hover:bg-red-500/80 transition-colors z-10"
            >
              Clear
            </button>
          )}
          <div className="absolute left-7 z-10" style={{ bottom: -54 }} onClick={(e) => { e.stopPropagation(); avatarFileRef.current?.click(); }}>
            <div
              className="relative flex items-center justify-center rounded-full overflow-hidden border-[5px] text-white font-bold text-4xl select-none cursor-pointer group/av"
              style={{ width: 108, height: 108, background: draft.color, borderColor: "var(--surface-raised)" }}
            >
              {draft.avatarUrl
                ? <img src={draft.avatarUrl} alt="" className="h-full w-full object-cover" />
                : getInitials(draft.displayName || "?")}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/av:bg-black/45 transition-colors">
                <Camera size={22} className="text-white opacity-0 group-hover/av:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>

        <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload("bannerUrl", e)} />
        <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload("avatarUrl", e)} />

        {/* Name / Status */}
        <div className="flex-shrink-0 flex items-center" style={{ paddingLeft: 155, paddingRight: 24, paddingTop: 10, paddingBottom: 16, minHeight: 82 }}>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {editingName ? (
                <input
                  autoFocus value={draft.displayName}
                  onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                  className="flex-1 bg-transparent border-b-2 border-[var(--accent)] outline-none text-[var(--text-primary)] font-bold"
                  style={{ fontSize: 22 }} maxLength={32}
                />
              ) : (
                <span className="font-bold text-[var(--text-primary)] truncate" style={{ fontSize: 22 }}>
                  {draft.displayName || "Anonymous"}
                </span>
              )}
              <button onClick={() => setEditingName((v) => !v)} className="flex-shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-overlay)] transition-colors">
                <Pencil size={14} />
              </button>
            </div>
            <div className="relative flex items-center gap-2">
              {editingStatus ? (
                <>
                  <button onClick={() => setShowEmojiPicker((v) => !v)} className="flex-shrink-0 text-lg leading-none">
                    {draft.statusEmoji || <Smile size={16} className="text-[var(--text-muted)]" />}
                  </button>
                  <input
                    autoFocus={!showEmojiPicker} value={draft.status ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                    onBlur={() => { if (!showEmojiPicker) setEditingStatus(false); }}
                    onKeyDown={(e) => e.key === "Enter" && setEditingStatus(false)}
                    placeholder="What are you up to?" maxLength={128}
                    className="flex-1 bg-transparent border-b border-[var(--border)] outline-none text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]"
                  />
                  {showEmojiPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                      <div className="absolute top-full left-0 z-20 mt-1 rounded-xl border border-[var(--border)] shadow-2xl p-3 grid grid-cols-3 gap-1.5" style={{ background: "var(--surface-raised)" }}>
                        {STATUS_PRESETS.map((p) => (
                          <button key={p.emoji} onClick={() => { setDraft((d) => ({ ...d, statusEmoji: p.emoji, status: d.status || p.text })); setShowEmojiPicker(false); }}
                            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors">
                            <span>{p.emoji}</span><span className="truncate">{p.text}</span>
                          </button>
                        ))}
                        {(draft.statusEmoji || draft.status) && (
                          <button onClick={() => { setDraft((d) => ({ ...d, statusEmoji: undefined, status: "" })); setShowEmojiPicker(false); setEditingStatus(false); }}
                            className="col-span-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors mt-0.5">
                            <X size={10} /> Clear status
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <span className="text-sm text-[var(--text-secondary)] truncate">
                  {draft.statusEmoji && <span className="mr-1">{draft.statusEmoji}</span>}
                  {draft.status || <span className="text-[var(--text-muted)] italic text-xs">Set a status…</span>}
                </span>
              )}
              <button onClick={() => setEditingStatus((v) => !v)} className="flex-shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-overlay)] transition-colors">
                <Pencil size={12} />
              </button>
            </div>
            <input
              value={draft.pronouns ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, pronouns: e.target.value }))}
              placeholder="pronouns (optional)"
              maxLength={40}
              className="text-xs text-[var(--text-muted)] bg-transparent outline-none border-b border-transparent focus:border-[var(--border)] placeholder:text-[var(--text-muted)] placeholder:opacity-40 w-48 transition-colors"
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="h-px flex-shrink-0" style={{ background: "var(--border)" }} />

          {/* Profile Board */}
          <div className="flex-1 flex flex-col min-h-0 px-5 pt-4 pb-4">
            <div className="flex items-center gap-3 mb-2.5 flex-wrap flex-shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Profile Board</p>
              <span className="text-[11px] text-[var(--text-muted)] opacity-60">Click a block to open its editor · drag &amp; resize freely</span>
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                <span className="text-[11px] text-[var(--text-muted)] mr-0.5">Board bg:</span>
                {BOARD_BG_COLORS.map((c) => (
                  <button key={c} onClick={() => { setBoardBg(c); setBoardBgImage(undefined); }}
                    className="h-4 w-4 rounded-sm transition-all hover:scale-110"
                    style={{ background: c, border: !boardBgImage && boardBg === c ? "2px solid white" : "1px solid rgba(255,255,255,0.25)" }} />
                ))}
                {/* Image upload */}
                {boardBgImage ? (
                  <div className="flex items-center gap-1">
                    <div className="h-4 w-6 rounded-sm overflow-hidden border border-white/40">
                      <img src={boardBgImage} alt="" className="h-full w-full object-cover" />
                    </div>
                    <button onClick={() => setBoardBgImage(undefined)}
                      className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => boardBgImageRef.current?.click()}
                    className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] border border-dashed border-[var(--border)] hover:border-[var(--text-muted)] transition-colors">
                    <Camera size={10} /> img
                  </button>
                )}
                <input ref={boardBgImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setBoardBgImage(ev.target?.result as string);
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }} />
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <ProfileCanvas blocks={profileBlocks} onChange={setProfileBlocks} boardBg={boardBg} boardBgImage={boardBgImage} />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)] flex-shrink-0">
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors">
            Cancel
          </button>
          <button onClick={() => void handleSave()} className={cn("rounded-lg px-5 py-1.5 text-sm font-medium transition-all", saved ? "bg-green-500 text-white" : "bg-[var(--accent)] text-white hover:opacity-90")}>
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>

      {cropTarget && (
        <ImageCropModal
          src={cropTarget.src}
          shape={cropTarget.field === "avatarUrl" ? "circle" : "rect"}
          previewW={cropTarget.field === "avatarUrl" ? 280 : 560}
          previewH={cropTarget.field === "avatarUrl" ? 280 : 153}
          outputW={cropTarget.field === "avatarUrl" ? 256 : 1200}
          outputH={cropTarget.field === "avatarUrl" ? 256 : 327}
          onApply={(url) => { setDraft((d) => ({ ...d, [cropTarget.field]: url })); setCropTarget(null); }}
          onClose={() => setCropTarget(null)}
        />
      )}
    </>
  );
}

// ── Profile canvas ─────────────────────────────────────────────────────────────

function ProfileCanvas({ blocks, onChange, boardBg, boardBgImage }: { blocks: ProfileBlock[]; onChange: (b: ProfileBlock[]) => void; boardBg: string; boardBgImage?: string }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ id: string; sx: number; sy: number; ow: number; oh: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Resize takes priority — if resizing, skip drag entirely
      const r = resizeRef.current;
      if (r) {
        const bs = blocksRef.current;
        onChangeRef.current(bs.map((b) =>
          b.id === r.id
            ? { ...b, w: Math.max(1, r.ow + (e.clientX - r.sx)), h: Math.max(1, r.oh + (e.clientY - r.sy)) }
            : b
        ));
        return;
      }
      const d = dragRef.current;
      if (d) {
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { width, height } = canvas.getBoundingClientRect();
        const bs = blocksRef.current;
        onChangeRef.current(bs.map((b) =>
          b.id === d.id
            ? { ...b, x: Math.max(0, Math.min(width - b.w, d.ox + dx)), y: Math.max(0, Math.min(height - b.h, d.oy + dy)) }
            : b
        ));
      }
    };
    const onUp = () => { dragRef.current = null; resizeRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const addBlock = () => {
    if (blocks.length >= MAX_BLOCKS) return;
    const nb = makeBlock(blocks.length);
    onChange([...blocks, nb]);
    setSelectedId(nb.id);
  };

  const updateBlock = (id: string, patch: Partial<ProfileBlock>) =>
    onChange(blocks.map((b) => b.id === id ? { ...b, ...patch } : b));

  const deleteBlock = (id: string) => { onChange(blocks.filter((b) => b.id !== id)); setSelectedId(null); };

  return (
    <>
      {/* Canvas — fills available flex space */}
      <div
        ref={canvasRef}
        className="rounded-xl overflow-hidden border border-[var(--border)] flex-1"
        style={{
          position: "relative",
          minHeight: "200px",
          background: boardBgImage ? undefined : boardBg,
          backgroundImage: boardBgImage
            ? `radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px), url(${boardBgImage})`
            : "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: boardBgImage ? "24px 24px, cover" : "24px 24px",
          backgroundPosition: boardBgImage ? "0 0, center" : "0 0",
        }}
        onClick={() => setSelectedId(null)}
      >
        {blocks.map((block) => (
          <ProfileBlockCard
            key={block.id} block={block} selected={block.id === selectedId}
            onMouseDown={(e) => {
              e.stopPropagation();
              hasDraggedRef.current = false;
              dragRef.current = { id: block.id, sx: e.clientX, sy: e.clientY, ox: block.x, oy: block.y };
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!hasDraggedRef.current) setSelectedId((v) => v === block.id ? null : block.id);
            }}
            onResizeMouseDown={(e) => {
              e.stopPropagation();
              hasDraggedRef.current = true;
              dragRef.current = null; // ensure drag doesn't compete
              resizeRef.current = { id: block.id, sx: e.clientX, sy: e.clientY, ow: block.w, oh: block.h };
            }}
          />
        ))}

        {blocks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 pointer-events-none select-none">
            <p className="text-sm text-[var(--text-muted)]">Your profile board is empty</p>
            <p className="text-xs text-[var(--text-muted)] opacity-60">Add blocks to showcase yourself</p>
          </div>
        )}

        {blocks.length < MAX_BLOCKS && (
          <button
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 z-10"
            style={{ background: "var(--accent)" }}
            onClick={(e) => { e.stopPropagation(); addBlock(); }}
          >
            <Plus size={12} /> Add Block
          </button>
        )}
      </div>

      {/* Detached floating editor window — rendered via portal outside the modal DOM */}
      {selectedBlock && (
        <FloatingEditorWindow
          block={selectedBlock}
          onChange={(patch) => updateBlock(selectedBlock.id, patch)}
          onDelete={() => deleteBlock(selectedBlock.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

// ── Block card (canvas render) ─────────────────────────────────────────────────

function ProfileBlockCard({ block, selected, onMouseDown, onClick, onResizeMouseDown }: {
  block: ProfileBlock; selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    // Outer shell: positions the block, overflow visible so the resize handle can poke outside
    <div
      onMouseDown={onMouseDown} onClick={onClick}
      style={{
        position: "absolute", left: block.x, top: block.y,
        width: block.w, height: block.h,
        overflow: "visible", cursor: "grab", userSelect: "none",
      }}
    >
      {/* Inner card: clips content, renders the visual block */}
      <div style={{
        position: "absolute", inset: 0,
        background: block.color, borderRadius: 10,
        border: selected ? "2px solid var(--accent)" : "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        boxShadow: selected ? "0 0 0 3px rgba(88,101,242,0.35)" : "0 2px 10px rgba(0,0,0,0.35)",
        transition: "border-color 0.1s, box-shadow 0.1s",
      }}>
        {block.bgImage && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${block.bgImage})`,
            backgroundSize: "cover", backgroundPosition: "center",
            opacity: block.bgOpacity ?? 0.5, pointerEvents: "none",
          }} />
        )}
        <div style={{ position: "relative", zIndex: 1, padding: "10px 12px", height: "100%", overflow: "hidden" }}>
          {block.items.map((item) => (
            <div key={item.id} style={{ marginBottom: 5 }}>
              {item.type === "text" && (
                <p style={{
                  fontSize: item.fontSize ?? 12,
                  fontFamily: item.fontFamily ? FONT_FAMILY_CSS[item.fontFamily] : "inherit",
                  fontWeight: item.fontWeight ?? (item.bold ? 700 : 400),
                  fontStyle: item.italic ? "italic" : "normal",
                  textDecoration: [item.underline ? "underline" : "", item.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none",
                  color: item.color ?? "rgba(255,255,255,0.65)",
                  textAlign: item.align ?? "left",
                  lineHeight: item.lineHeight ? LINE_HEIGHT_MAP[item.lineHeight] : 1.5,
                  letterSpacing: item.letterSpacing ? LETTER_SPACING_MAP[item.letterSpacing] : undefined,
                  whiteSpace: "pre-wrap", margin: 0,
                }}>
                  {item.content}
                </p>
              )}
              {item.type === "list" && (
                <>
                  {item.title && (
                    <p style={{
                      fontSize: item.fontSize ?? 12, fontWeight: 600,
                      fontFamily: item.fontFamily ? FONT_FAMILY_CSS[item.fontFamily] : "inherit",
                      color: item.color ?? "rgba(255,255,255,0.8)", marginBottom: 3, marginTop: 0,
                    }}>
                      {item.title}
                    </p>
                  )}
                  {item.entries.slice(0, 5).map((entry) => (
                    <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", flexShrink: 0, marginTop: 1 }}>
                        {entry.checked ? "☑" : "•"}
                      </span>
                      <span style={{
                        fontSize: item.fontSize ?? 12,
                        fontFamily: item.fontFamily ? FONT_FAMILY_CSS[item.fontFamily] : "inherit",
                        color: entry.checked ? "rgba(255,255,255,0.3)" : (item.color ?? "rgba(255,255,255,0.65)"),
                        textDecoration: entry.checked ? "line-through" : "none",
                        lineHeight: 1.4,
                      }}>
                        {entry.text}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Resize handle — sibling to the inner card, lives outside overflow:hidden */}
      {selected && (
        <div
          onMouseDown={onResizeMouseDown} onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", bottom: -8, right: -8, width: 20, height: 20,
            cursor: "se-resize", background: "white",
            borderRadius: 4, border: "2px solid var(--accent)", zIndex: 20,
          }}
        />
      )}
    </div>
  );
}

// ── Floating editor window (portal — lives outside the modal DOM) ─────────────

function FloatingEditorWindow({ block, onChange, onDelete, onClose }: {
  block: ProfileBlock;
  onChange: (patch: Partial<ProfileBlock>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - 310,
    y: Math.max(60, (window.innerHeight - 560) / 2),
  }));
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 280, d.ox + e.clientX - d.sx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, d.oy + e.clientY - d.sy)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return createPortal(
    <div
      className="fixed flex flex-col rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: 280, maxHeight: "80vh", zIndex: 1200, background: "var(--surface)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] cursor-grab select-none flex-shrink-0"
        style={{ background: "var(--surface-raised)" }}
        onMouseDown={(e) => {
          e.preventDefault();
          dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
        }}
      >
        <GripVertical size={13} className="text-[var(--text-muted)]" />
        <span className="text-xs font-semibold text-[var(--text-primary)] flex-1">Block Editor</span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] transition-colors"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <BlockEditorPanel block={block} onChange={onChange} onDelete={onDelete} onClose={onClose} />
      </div>
    </div>,
    document.body
  );
}

// ── Block editor panel (floating) ──────────────────────────────────────────────

function BlockEditorPanel({ block, onChange, onDelete, onClose }: {
  block: ProfileBlock;
  onChange: (patch: Partial<ProfileBlock>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropOverId, setDropOverId] = useState<string | null>(null);

  const patchTextItem = (id: string, patch: Partial<TextItem>) =>
    onChange({ items: block.items.map((i) => i.id === id && i.type === "text" ? { ...i, ...patch } : i) });

  const patchListItem = (id: string, patch: Partial<ListItem>) =>
    onChange({ items: block.items.map((i) => i.id === id && i.type === "list" ? { ...i, ...patch } : i) });

  const deleteItem = (id: string) => onChange({ items: block.items.filter((i) => i.id !== id) });

  const addText = () => {
    if (block.items.length >= 4) return;
    onChange({ items: [...block.items, { id: crypto.randomUUID(), type: "text" as const, content: "" }] });
  };

  const addList = () => {
    if (block.items.length >= 4) return;
    onChange({ items: [...block.items, { id: crypto.randomUUID(), type: "list" as const, title: "", entries: [] }] });
  };

  const reorderItems = (fromId: string, toId: string) => {
    const items = [...block.items];
    const fromIdx = items.findIndex((i) => i.id === fromId);
    const toIdx = items.findIndex((i) => i.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    onChange({ items });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* Block color */}
        <Section label="Block Color">
          <div className="flex flex-wrap gap-2">
            {BLOCK_COLORS.map((c) => (
              <button key={c} onClick={() => onChange({ color: c })}
                className={cn("h-5 w-5 rounded-full border-2 transition-all hover:scale-110", block.color === c ? "border-white" : "border-transparent")}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </Section>

        {/* Background image */}
        <Section label="Background Image">
          {block.bgImage ? (
            <div className="relative rounded-lg overflow-hidden h-12 mb-2">
              <img src={block.bgImage} alt="" className="w-full h-full object-cover" />
              <button onClick={() => onChange({ bgImage: undefined })} className="absolute top-1 right-1 bg-black/70 rounded p-0.5 hover:bg-red-500 transition-colors">
                <X size={10} className="text-white" />
              </button>
            </div>
          ) : (
            <button onClick={() => bgFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--text-muted)] transition-colors mb-2">
              <Plus size={10} /> Set image
            </button>
          )}
          <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => onChange({ bgImage: ev.target?.result as string });
            reader.readAsDataURL(file);
            e.target.value = "";
          }} />
          {block.bgImage && (
            <div>
              <p className="text-[11px] text-[var(--text-muted)] mb-1">Opacity: {Math.round((block.bgOpacity ?? 0.5) * 100)}%</p>
              <input type="range" min="0.05" max="1" step="0.05" value={block.bgOpacity ?? 0.5}
                onChange={(e) => onChange({ bgOpacity: Number(e.target.value) })}
                className="w-full" style={{ accentColor: "var(--accent)" }} />
            </div>
          )}
        </Section>

        {/* Items */}
        <Section label={`Items (${block.items.length}/4)`}>
          <div className="flex flex-col gap-1.5">
            {block.items.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => { setDraggingId(null); setDropOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); setDropOverId(item.id); }}
                onDrop={() => {
                  if (draggingId && draggingId !== item.id) reorderItems(draggingId, item.id);
                  setDraggingId(null); setDropOverId(null);
                }}
                className={cn(
                  "rounded-lg flex flex-col gap-1.5 p-2 transition-all",
                  draggingId === item.id ? "opacity-40" : "opacity-100",
                  dropOverId === item.id && draggingId !== item.id ? "ring-2 ring-[var(--accent)]" : "",
                )}
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
              >
                {/* Item header */}
                <div className="flex items-center gap-1">
                  <GripVertical size={12} className="text-[var(--text-muted)] cursor-grab flex-shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] flex-1">
                    {item.type === "text" ? "Text" : "List"}
                  </span>
                  <button onClick={() => deleteItem(item.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
                    <X size={11} />
                  </button>
                </div>

                {item.type === "text" && (
                  <TextItemEditor item={item} onChange={(patch) => patchTextItem(item.id, patch)} />
                )}
                {item.type === "list" && (
                  <ListItemEditor item={item} onChange={(patch) => patchListItem(item.id, patch)} />
                )}
              </div>
            ))}
          </div>

          {block.items.length < 4 && (
            <div className="flex gap-1.5 mt-1.5">
              <button onClick={addText} className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors">
                <Plus size={10} /> Text
              </button>
              <button onClick={addList} className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors">
                <Plus size={10} /> List
              </button>
            </div>
          )}
        </Section>

        {/* Delete */}
        <button onClick={onDelete} className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition-colors">
          <X size={11} /> Delete Block
        </button>
      </div>
    </div>
  );
}

// ── Text item editor ───────────────────────────────────────────────────────────

function TextItemEditor({ item, onChange }: { item: TextItem; onChange: (p: Partial<TextItem>) => void }) {
  const fw = item.fontWeight ?? (item.bold ? 700 : 400);
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={item.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder="Write something…" rows={2} maxLength={400}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] resize-none transition-colors"
      />

      {/* Font family */}
      <div className="flex gap-1">
        {FONT_FAMILIES.map(({ key, label, css }) => (
          <button key={key} onClick={() => onChange({ fontFamily: key })}
            className={cn("flex-1 rounded py-0.5 text-[11px] transition-colors", item.fontFamily === key || (!item.fontFamily && key === "sans") ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}
            style={{ fontFamily: css }}>
            {label}
          </button>
        ))}
      </div>

      {/* Font size + weight */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">Size</label>
        <input type="range" min={8} max={32} step={1} value={item.fontSize ?? 12}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="flex-1" style={{ accentColor: "var(--accent)" }} />
        <span className="text-[10px] text-[var(--text-muted)] w-5 text-right">{item.fontSize ?? 12}</span>
      </div>

      {/* Font weight row */}
      <div className="flex gap-0.5">
        {FONT_WEIGHTS.map((w) => (
          <button key={w} onClick={() => onChange({ fontWeight: w, bold: w >= 700 })}
            className={cn("flex-1 rounded py-0.5 text-[10px] transition-colors", fw === w ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}
            style={{ fontWeight: w }}>
            {FONT_WEIGHT_LABELS[w]}
          </button>
        ))}
      </div>

      {/* Decorations + alignment */}
      <div className="flex items-center gap-1">
        <button onClick={() => onChange({ italic: !item.italic })}
          className={cn("rounded px-1.5 py-0.5 text-xs italic transition-colors", item.italic ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}>
          I
        </button>
        <button onClick={() => onChange({ underline: !item.underline })}
          className={cn("rounded px-1.5 py-0.5 text-xs underline transition-colors", item.underline ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}>
          U
        </button>
        <button onClick={() => onChange({ strikethrough: !item.strikethrough })}
          className={cn("rounded px-1.5 py-0.5 text-xs line-through transition-colors", item.strikethrough ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}>
          S
        </button>
        <div className="flex-1" />
        {(["left","center","right"] as const).map((a) => (
          <button key={a} onClick={() => onChange({ align: a })}
            className={cn("rounded p-0.5 transition-colors", item.align === a || (!item.align && a === "left") ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
            {a === "left" ? <AlignLeft size={12} /> : a === "center" ? <AlignCenter size={12} /> : <AlignRight size={12} />}
          </button>
        ))}
      </div>

      {/* Line height + letter spacing */}
      <div className="flex gap-1">
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="text-[10px] text-[var(--text-muted)]">Spacing</span>
          <div className="flex gap-0.5">
            {(["tight","normal","relaxed"] as LineHeight[]).map((lh) => (
              <button key={lh} onClick={() => onChange({ lineHeight: lh })}
                className={cn("flex-1 rounded py-0.5 text-[10px] transition-colors capitalize", (item.lineHeight ?? "normal") === lh ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}>
                {lh === "tight" ? "Tght" : lh === "normal" ? "Nrm" : "Rlxd"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="text-[10px] text-[var(--text-muted)]">Tracking</span>
          <div className="flex gap-0.5">
            {(["normal","wide","wider"] as LetterSpacing[]).map((ls) => (
              <button key={ls} onClick={() => onChange({ letterSpacing: ls })}
                className={cn("flex-1 rounded py-0.5 text-[10px] transition-colors", (item.letterSpacing ?? "normal") === ls ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}>
                {ls === "normal" ? "Nrm" : ls === "wide" ? "Wide" : "Xwde"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Color palette + custom */}
      <div className="flex gap-1 flex-wrap items-center">
        {TEXT_COLORS.map((c) => (
          <button key={c} onClick={() => onChange({ color: c })}
            className={cn("h-4 w-4 rounded-full border-2 transition-all hover:scale-110", item.color === c ? "border-white" : "border-transparent")}
            style={{ background: c }} />
        ))}
        <input type="color" value={item.color?.startsWith("rgba") ? "#ffffff" : (item.color ?? "#ffffff")}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-4 w-4 rounded cursor-pointer border-0 p-0 bg-transparent"
          title="Custom color" />
      </div>
    </div>
  );
}

// ── List item editor ───────────────────────────────────────────────────────────

function ListItemEditor({ item, onChange }: { item: ListItem; onChange: (p: Partial<ListItem>) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <input value={item.title} onChange={(e) => onChange({ title: e.target.value })}
        placeholder="List title (optional)" maxLength={40}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] transition-colors" />

      {/* Font family */}
      <div className="flex gap-1">
        {FONT_FAMILIES.map(({ key, label, css }) => (
          <button key={key} onClick={() => onChange({ fontFamily: key })}
            className={cn("flex-1 rounded py-0.5 text-[11px] transition-colors", (item.fontFamily ?? "sans") === key ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)]")}
            style={{ fontFamily: css }}>
            {label}
          </button>
        ))}
      </div>

      {/* Size + color */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">Size</label>
        <input type="range" min={8} max={18} step={1} value={item.fontSize ?? 12}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="flex-1" style={{ accentColor: "var(--accent)" }} />
        <span className="text-[10px] text-[var(--text-muted)] w-5 text-right">{item.fontSize ?? 12}</span>
      </div>
      <div className="flex gap-1 flex-wrap items-center">
        {TEXT_COLORS.map((c) => (
          <button key={c} onClick={() => onChange({ color: c })}
            className={cn("h-4 w-4 rounded-full border-2 transition-all hover:scale-110", item.color === c ? "border-white" : "border-transparent")}
            style={{ background: c }} />
        ))}
        <input type="color" value={item.color?.startsWith("rgba") ? "#ffffff" : (item.color ?? "#ffffff")}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-4 w-4 rounded cursor-pointer border-0 p-0 bg-transparent" title="Custom color" />
      </div>

      {/* Entries */}
      {item.entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <button
            onClick={() => onChange({ entries: item.entries.map((en) => en.id === entry.id ? { ...en, checked: !en.checked } : en) })}
            className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm leading-none"
          >
            {entry.checked ? "☑" : "☐"}
          </button>
          <input
            value={entry.text}
            onChange={(e) => onChange({ entries: item.entries.map((en) => en.id === entry.id ? { ...en, text: e.target.value } : en) })}
            placeholder="Entry…" maxLength={80}
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none border-b border-[var(--border)] pb-0.5 placeholder:text-[var(--text-muted)]"
          />
          <button onClick={() => onChange({ entries: item.entries.filter((en) => en.id !== entry.id) })}
            className="flex-shrink-0 text-[var(--text-muted)] hover:text-red-400 transition-colors">
            <X size={10} />
          </button>
        </div>
      ))}
      {item.entries.length < 8 && (
        <button onClick={() => onChange({ entries: [...item.entries, { id: crypto.randomUUID(), text: "", checked: false }] })}
          className="text-left text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          + Add entry
        </button>
      )}
    </div>
  );
}

// ── Shared section wrapper ─────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      {children}
    </div>
  );
}
