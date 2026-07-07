"use client";

import { supabase } from "@/lib/supabase";
import { useBoardStore, BlockItem } from "@/store/boardStore";
import { uploadDataUrl } from "@/lib/storage";
import { downscaleToJpeg } from "@/lib/boardImage";

// ─── Block archive ────────────────────────────────────────────────────────────
// Snapshots of a block's contents, written either automatically by recurring
// resets (kind "auto") or on demand (kind "manual", pinned by default).
// Signed-in users store archives in the block_archives table; guests (or a
// failed insert, e.g. the board row doesn't exist server-side yet) fall back
// to localStorage so a snapshot is never silently dropped.

export interface BlockArchiveEntry {
  id: string;
  boardId: string;
  boxId: string;
  title: string;
  /** Period this snapshot covered (auto resets); null for manual saves */
  periodStart: number | null;
  periodEnd: number | null;
  kind: "auto" | "manual";
  pinned: boolean;
  items: BlockItem[];
  /** Real capture of the block at save time — Storage URL, or a compact JPEG data URL for guests */
  imageUrl?: string;
  createdAt: number;
}

/** Rolling window of unpinned auto-snapshots kept per block (oldest pruned). */
export const MAX_AUTO_PER_BOX = 30;
/** Hard ceiling per block across all kinds — protects the DB from runaway growth. */
export const MAX_TOTAL_PER_BOX = 200;
/** Guests store archives in localStorage, which is ~10MB total — keep it tight. */
const LOCAL_MAX_AUTO_PER_BOX = 10;
const LOCAL_MAX_TOTAL_PER_BOX = 50;
const LOCAL_KEY = "crecoard-block-archives-v1";

export type SaveArchiveResult = { ok: true } | { ok: false; reason: "limit" | "error" };

function isSupabaseMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(url) && !url.includes("placeholder") && !url.includes("your-project");
}

function signedInUserId(): string | null {
  return isSupabaseMode() ? useBoardStore.getState().currentUserId ?? null : null;
}

// ─── localStorage backend ─────────────────────────────────────────────────────

function readLocal(): BlockArchiveEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as BlockArchiveEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: BlockArchiveEntry[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries));
  } catch {
    window.dispatchEvent(new CustomEvent("plancraft:storage-error"));
  }
}

function saveLocal(entry: BlockArchiveEntry): SaveArchiveResult {
  const all = readLocal();
  // Idempotent per (box, boundary): a second client racing the same reset no-ops
  if (
    entry.kind === "auto" &&
    all.some((e) => e.boxId === entry.boxId && e.kind === "auto" && e.periodEnd === entry.periodEnd)
  )
    return { ok: true };
  const forBox = all.filter((e) => e.boxId === entry.boxId);
  if (entry.kind === "manual" && forBox.length >= LOCAL_MAX_TOTAL_PER_BOX) return { ok: false, reason: "limit" };
  all.push(entry);
  // Prune oldest unpinned autos beyond the window
  const autos = all
    .filter((e) => e.boxId === entry.boxId && e.kind === "auto" && !e.pinned)
    .sort((a, b) => b.createdAt - a.createdAt);
  const drop = new Set(autos.slice(LOCAL_MAX_AUTO_PER_BOX).map((e) => e.id));
  writeLocal(all.filter((e) => !drop.has(e.id)));
  return { ok: true };
}

// ─── Supabase backend ─────────────────────────────────────────────────────────

interface ArchiveRow {
  id: string;
  board_id: string;
  box_id: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  kind: "auto" | "manual";
  pinned: boolean;
  data: { items: BlockItem[]; imageUrl?: string };
  created_at: string;
}

function rowToEntry(r: ArchiveRow): BlockArchiveEntry {
  return {
    id: r.id,
    boardId: r.board_id,
    boxId: r.box_id,
    title: r.title,
    periodStart: r.period_start ? new Date(r.period_start).getTime() : null,
    periodEnd: r.period_end ? new Date(r.period_end).getTime() : null,
    kind: r.kind,
    pinned: r.pinned,
    items: r.data?.items ?? [],
    imageUrl: r.data?.imageUrl,
    createdAt: new Date(r.created_at).getTime(),
  };
}

async function saveRemote(entry: BlockArchiveEntry, userId: string): Promise<SaveArchiveResult> {
  if (entry.kind === "manual") {
    const { count } = await supabase
      .from("block_archives")
      .select("id", { count: "exact", head: true })
      .eq("box_id", entry.boxId);
    if ((count ?? 0) >= MAX_TOTAL_PER_BOX) return { ok: false, reason: "limit" };
  }

  const { error } = await supabase.from("block_archives").insert({
    board_id: entry.boardId,
    box_id: entry.boxId,
    user_id: userId,
    title: entry.title,
    period_start: entry.periodStart ? new Date(entry.periodStart).toISOString() : null,
    period_end: entry.periodEnd ? new Date(entry.periodEnd).toISOString() : null,
    kind: entry.kind,
    pinned: entry.pinned,
    data: { items: entry.items, ...(entry.imageUrl ? { imageUrl: entry.imageUrl } : {}) },
  });
  if (error) {
    // 23505 = unique violation: another client already archived this boundary
    if (error.code === "23505") return { ok: true };
    return { ok: false, reason: "error" };
  }

  // Prune oldest unpinned autos beyond the rolling window
  const { data: stale } = await supabase
    .from("block_archives")
    .select("id")
    .eq("box_id", entry.boxId)
    .eq("kind", "auto")
    .eq("pinned", false)
    .order("created_at", { ascending: false })
    .range(MAX_AUTO_PER_BOX, MAX_AUTO_PER_BOX + 100);
  if (stale && stale.length > 0) {
    await supabase.from("block_archives").delete().in("id", stale.map((r) => r.id));
  }
  return { ok: true };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveBlockArchive(
  entry: Omit<BlockArchiveEntry, "id" | "createdAt" | "imageUrl">,
  /** Raw capture from captureBoxImage — uploaded to Storage (signed-in) or embedded as a compact thumb (guests) */
  imageDataUrl?: string
): Promise<SaveArchiveResult> {
  const full: BlockArchiveEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  const uid = signedInUserId();

  if (imageDataUrl) {
    try {
      if (uid) {
        // Full-quality PNG in Storage; if the upload fails, degrade to an
        // embedded thumb rather than losing the picture.
        const url = await uploadDataUrl(imageDataUrl, uid, "archives", "block-snapshot.png");
        full.imageUrl = url ?? (await downscaleToJpeg(imageDataUrl));
      } else {
        // localStorage quota is precious — embed a small JPEG only
        full.imageUrl = await downscaleToJpeg(imageDataUrl);
      }
    } catch { /* picture is best-effort */ }
  }

  if (uid) {
    const res = await saveRemote(full, uid);
    // Never drop a snapshot: quota refusals stay refused, but transient/RLS
    // errors degrade to a local copy the user can still export.
    if (!res.ok && res.reason === "error") return saveLocal(full);
    return res;
  }
  return saveLocal(full);
}

export async function listBlockArchives(boardId: string, boxId: string): Promise<BlockArchiveEntry[]> {
  const local = readLocal().filter((e) => e.boardId === boardId && e.boxId === boxId);
  let remote: BlockArchiveEntry[] = [];
  if (signedInUserId()) {
    const { data } = await supabase
      .from("block_archives")
      .select("*")
      .eq("board_id", boardId)
      .eq("box_id", boxId)
      .order("created_at", { ascending: false });
    remote = (data as ArchiveRow[] | null)?.map(rowToEntry) ?? [];
  }
  const seen = new Set(remote.map((e) => e.id));
  return [...remote, ...local.filter((e) => !seen.has(e.id))].sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteBlockArchive(id: string): Promise<void> {
  const local = readLocal();
  if (local.some((e) => e.id === id)) {
    writeLocal(local.filter((e) => e.id !== id));
    return;
  }
  if (signedInUserId()) await supabase.from("block_archives").delete().eq("id", id);
}

export async function setBlockArchivePinned(id: string, pinned: boolean): Promise<void> {
  const local = readLocal();
  const entry = local.find((e) => e.id === id);
  if (entry) {
    entry.pinned = pinned;
    writeLocal(local);
    return;
  }
  if (signedInUserId()) await supabase.from("block_archives").update({ pinned }).eq("id", id);
}

/** Download entries as a JSON file — the user's own offline copy, re-importable via importBlockArchives. */
export function downloadArchivesJson(entries: BlockArchiveEntry[], filename: string): void {
  // Versioned envelope so the entry shape can evolve; import accepts this and the
  // legacy bare-array format from files exported before versioning existed.
  const payload = { crecoardArchive: 1, exportedAt: new Date().toISOString(), entries };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import ───────────────────────────────────────────────────────────────────
// The inverse of the JSON export: entries are validated field-by-field (this is
// user-supplied JSON that ends up rendered by ItemRenderer), remapped onto the
// block being imported into (the original may be long gone — that's the point
// of a backup), deduped by id and auto-boundary, and pinned so pruning never
// eats restored history.

export interface ImportArchivesResult {
  ok: boolean;
  imported: number;
  duplicates: number;
  invalid: number;
  limited: number;
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_JSON = 1_000_000; // per-entry cap, matching the community-board 1MB precedent
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeImportedEntry(raw: unknown, boardId: string, boxId: string): BlockArchiveEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!Array.isArray(e.items)) return null;
  if (!e.items.every((i) => i && typeof i === "object" && typeof (i as { type?: unknown }).type === "string")) return null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const entry: BlockArchiveEntry = {
    // Non-UUID ids can't go into the remote PK column — regenerate (loses dedupe for that entry only)
    id: typeof e.id === "string" && UUID_RE.test(e.id) ? e.id : crypto.randomUUID(),
    boardId,
    boxId,
    title: typeof e.title === "string" ? e.title.slice(0, 200) : "",
    periodStart: num(e.periodStart),
    periodEnd: num(e.periodEnd),
    kind: e.kind === "auto" ? "auto" : "manual",
    pinned: true,
    items: e.items as BlockItem[],
    createdAt: num(e.createdAt) ?? Date.now(),
  };
  if (
    typeof e.imageUrl === "string" &&
    (/^https?:\/\//.test(e.imageUrl) || e.imageUrl.startsWith("data:image/")) &&
    e.imageUrl.length < 2_000_000
  ) {
    entry.imageUrl = e.imageUrl;
  }
  if (JSON.stringify(entry).length > MAX_ENTRY_JSON) return null;
  return entry;
}

export async function importBlockArchives(
  boardId: string,
  boxId: string,
  fileText: string
): Promise<ImportArchivesResult> {
  const fail: ImportArchivesResult = { ok: false, imported: 0, duplicates: 0, invalid: 0, limited: 0 };
  if (fileText.length > MAX_IMPORT_BYTES) return fail;
  let parsed: unknown;
  try { parsed = JSON.parse(fileText); } catch { return fail; }
  const rawEntries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)
      ? ((parsed as { entries: unknown[] }).entries)
      : null;
  if (!rawEntries) return fail;

  const existing = await listBlockArchives(boardId, boxId);
  const seenIds = new Set(existing.map((e) => e.id));
  const seenBoundaries = new Set(
    existing.filter((e) => e.kind === "auto" && e.periodEnd).map((e) => String(e.periodEnd))
  );

  const result: ImportArchivesResult = { ok: true, imported: 0, duplicates: 0, invalid: 0, limited: 0 };
  const uid = signedInUserId();
  const maxTotal = uid ? MAX_TOTAL_PER_BOX : LOCAL_MAX_TOTAL_PER_BOX;
  let total = existing.length;
  const localBatch: BlockArchiveEntry[] = [];

  for (const raw of rawEntries) {
    const entry = sanitizeImportedEntry(raw, boardId, boxId);
    if (!entry) { result.invalid++; continue; }
    if (seenIds.has(entry.id) || (entry.kind === "auto" && entry.periodEnd && seenBoundaries.has(String(entry.periodEnd)))) {
      result.duplicates++;
      continue;
    }
    if (total >= maxTotal) { result.limited++; continue; }

    if (uid) {
      const { error } = await supabase.from("block_archives").insert({
        id: entry.id,
        board_id: boardId,
        box_id: boxId,
        user_id: uid,
        title: entry.title,
        period_start: entry.periodStart ? new Date(entry.periodStart).toISOString() : null,
        period_end: entry.periodEnd ? new Date(entry.periodEnd).toISOString() : null,
        kind: entry.kind,
        pinned: true,
        data: { items: entry.items, ...(entry.imageUrl ? { imageUrl: entry.imageUrl } : {}) },
        created_at: new Date(entry.createdAt).toISOString(),
      });
      if (error) {
        if (error.code === "23505") { result.duplicates++; continue; }
        localBatch.push(entry); // degrade to local rather than dropping the entry
      }
    } else {
      localBatch.push(entry);
    }
    seenIds.add(entry.id);
    if (entry.kind === "auto" && entry.periodEnd) seenBoundaries.add(String(entry.periodEnd));
    total++;
    result.imported++;
  }

  if (localBatch.length > 0) {
    const all = readLocal();
    all.push(...localBatch);
    writeLocal(all);
  }
  return result;
}
