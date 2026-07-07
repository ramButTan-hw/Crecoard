"use client";

import type { BlockItem, BoxStyle } from "@/store/boardStore";
import type { BlockArchiveEntry } from "./blockArchive";

// ─── Human-readable exports for block archives ───────────────────────────────
// JSON keeps full fidelity for re-import, but most people just want to read or
// share what they wrote. Text (.txt) opens anywhere; PNG draws a shareable
// "journal card" in the block's own colors on a canvas — no dependencies.

export function periodLabel(e: BlockArchiveEntry): string {
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (e.periodStart && e.periodEnd && fmt(e.periodStart) !== fmt(e.periodEnd)) return `${fmt(e.periodStart)} – ${fmt(e.periodEnd)}`;
  if (e.periodEnd) return fmt(e.periodEnd);
  return new Date(e.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "block";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(filename);
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Items → readable text ────────────────────────────────────────────────────

function itemToText(item: BlockItem): string {
  switch (item.type) {
    case "text":
      return item.text ?? "";

    case "list": {
      const entries = item.listItems ?? [];
      const lines = entries.map((e, i) => {
        const indent = "  ".repeat(e.depth ?? 0);
        const marker =
          item.listMarker === "bullet" ? "•" :
          item.listMarker === "number" ? `${i + 1}.` :
          item.listMarker === "none" ? "" :
          e.checked ? "[x]" : "[ ]";
        const due = e.due ? `  (due ${e.due})` : "";
        return `${indent}${marker} ${e.text}${due}`.trimEnd();
      });
      const done = entries.filter((e) => e.checked).length;
      const header = item.listTitle
        ? `${item.listTitle}${item.listMarker === "checkbox" || !item.listMarker ? ` (${done}/${entries.length} done)` : ""}`
        : "";
      return [header, ...lines].filter(Boolean).join("\n");
    }

    case "kanban": {
      const cols = item.kanbanColumns ?? [];
      const cards = item.kanbanCards ?? [];
      return cols.map((col) => {
        const colCards = cards
          .filter((c) => c.columnId === col.id)
          .sort((a, b) => a.order - b.order)
          .map((c) => `  • ${c.text}${c.due ? ` (due ${c.due})` : ""}${c.description ? `\n    ${c.description}` : ""}`);
        return [`${col.title}:`, ...(colCards.length ? colCards : ["  (empty)"])].join("\n");
      }).join("\n");
    }

    case "table": {
      const cols = item.tableColumns ?? [];
      const rows = item.tableRows ?? [];
      const cell = (v: string | boolean | undefined) => (v === true ? "☑" : v === false ? "☐" : String(v ?? ""));
      const lines = rows.map((r) => cols.map((c) => `${c.name}: ${cell(r.cells[c.id])}`).join("  |  "));
      return [item.tableTitle, ...lines].filter(Boolean).join("\n");
    }

    case "calendar": {
      const evs = item.calendarEvents ?? [];
      return evs
        .map((ev) => `${ev.date}${ev.startTime ? ` ${ev.startTime}` : ""} — ${ev.title}`)
        .join("\n");
    }

    case "flashcard":
      return (item.flashcards ?? []).map((f) => `Q: ${f.front}\nA: ${f.back}`).join("\n\n");

    case "quiz":
      return (item.quizQuestions ?? [])
        .map((q) => [q.prompt, ...q.options.map((o, i) => `  ${i === q.correctIndex ? "✓" : "·"} ${o}`)].join("\n"))
        .join("\n\n");

    default:
      return "";
  }
}

export function entryToText(entry: BlockArchiveEntry): string {
  const header = `${entry.title || "Untitled block"} — ${periodLabel(entry)}`;
  const saved = `Saved ${new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  const body = entry.items.map(itemToText).filter(Boolean).join("\n\n");
  return [header, saved, "─".repeat(Math.min(header.length, 40)), "", body || "(no readable content)"].join("\n");
}

export function downloadArchivesText(entries: BlockArchiveEntry[], filename: string): void {
  const text = entries.map(entryToText).join("\n\n" + "═".repeat(40) + "\n\n");
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename.endsWith(".txt") ? filename : `${filename}.txt`);
}

// ─── PNG "journal card" ───────────────────────────────────────────────────────

const CARD_W = 800;
const PAD = 48;
const SCALE = 2; // draw at 2x for crisp text

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) { out.push(""); continue; }
    // Preserve leading indentation from the text converter
    const indent = paragraph.match(/^\s*/)?.[0] ?? "";
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const attempt = line ? `${line} ${word}` : indent + word;
      if (ctx.measureText(attempt).width > maxWidth && line) {
        out.push(line);
        line = indent + "  " + word; // hanging indent for wrapped lines
      } else {
        line = attempt;
      }
    }
    out.push(line);
  }
  return out;
}

/** Draw the entry as a shareable card in the block's own colors and download it. */
export async function downloadArchivePng(entry: BlockArchiveEntry, style: BoxStyle): Promise<void> {
  const bg = style.backgroundColor || "#25262b";
  const fg = style.fontColor || "#f2f2f2";
  const body = entry.items.map(itemToText).filter(Boolean).join("\n\n") || "(no readable content)";

  const measure = document.createElement("canvas").getContext("2d")!;
  const bodyFont = `17px ${style.fontFamily || "Inter"}, system-ui, sans-serif`;
  measure.font = bodyFont;
  const lines = wrapText(measure, body, CARD_W - PAD * 2);

  const lineH = 26;
  const headerH = 118;
  const footerH = 56;
  const height = headerH + lines.length * lineH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, height);

  // Header: title + period
  ctx.fillStyle = fg;
  ctx.font = `600 26px ${style.fontFamily || "Inter"}, system-ui, sans-serif`;
  ctx.fillText(entry.title || "Untitled block", PAD, PAD + 22, CARD_W - PAD * 2);
  ctx.globalAlpha = 0.65;
  ctx.font = `14px ${style.fontFamily || "Inter"}, system-ui, sans-serif`;
  ctx.fillText(periodLabel(entry), PAD, PAD + 50);
  ctx.globalAlpha = 0.25;
  ctx.fillRect(PAD, headerH - 18, CARD_W - PAD * 2, 1);
  ctx.globalAlpha = 1;

  // Body
  ctx.font = bodyFont;
  lines.forEach((line, i) => ctx.fillText(line, PAD, headerH + 8 + i * lineH, CARD_W - PAD * 2));

  // Footer watermark
  ctx.globalAlpha = 0.4;
  ctx.font = `12px ${style.fontFamily || "Inter"}, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("Crecoard", CARD_W - PAD, height - 24);
  ctx.globalAlpha = 1;

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (blob) downloadBlob(blob, `${entry.title || "block"}-${periodLabel(entry)}.png`);
}
