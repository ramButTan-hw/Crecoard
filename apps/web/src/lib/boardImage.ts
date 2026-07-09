"use client";

import { toPng } from "html-to-image";
import { useBoardStore } from "@/store/boardStore";
import { requestBlockShot } from "./blockShot";

/**
 * Rasterize the live board DOM to a PNG — a true picture of the board,
 * including background layers, block styles, and item content as rendered.
 * Captures the full board cropped to its content bounds, regardless of the
 * current pan/zoom.
 *
 * Known limits (inherent to DOM rasterization): iframe content (embeds,
 * widgets) and live wallpaper video render blank; cross-origin images without
 * CORS headers are skipped.
 */
export async function exportBoardImage(boardId: string): Promise<boolean> {
  const st = useBoardStore.getState();
  const board = st.boards.find((b) => b.id === boardId) ?? st.serverBoards[boardId];
  const node = document.querySelector<HTMLElement>("[data-board-canvas]");
  if (!board || !node) return false;

  // Crop to what's actually on the board — the canvas itself is mostly empty space
  const rects = [
    ...board.boxes.filter((b) => !b.deckOwnerId).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })),
    ...(board.boardItems ?? []).map((i) => ({ x: i.boardX, y: i.boardY, w: i.boardW, h: i.boardH })),
  ];
  if (rects.length === 0) return false;

  const PAD = 48;
  const minX = Math.max(0, Math.min(...rects.map((r) => r.x)) - PAD);
  const minY = Math.max(0, Math.min(...rects.map((r) => r.y)) - PAD);
  const width = Math.max(...rects.map((r) => r.x + r.w)) + PAD - minX;
  const height = Math.max(...rects.map((r) => r.y + r.h)) + PAD - minY;

  // 2x for crispness, dialed back for very large boards to keep the PNG sane
  const pixelRatio = width * height > 4_000_000 ? 1 : 2;

  const dataUrl = await toPng(node, {
    width,
    height,
    pixelRatio,
    backgroundColor: board.backgroundColor ?? "#1a1b1e",
    // The clone gets the export framing; the on-screen canvas keeps its pan/zoom
    style: {
      transform: `translate(${-minX}px, ${-minY}px)`,
      transformOrigin: "0 0",
      cursor: "default",
    },
    filter: (el) => !(el instanceof HTMLElement && el.dataset.noExport !== undefined),
  });

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${(board.name || "board").replace(/[\\/:*?"<>|]/g, "-")}.png`;
  a.click();
  return true;
}

/** Downscale a captured PNG data URL to a compact JPEG (guest/localStorage archives). */
export async function downscaleToJpeg(dataUrl: string, maxW = 1280, quality = 0.85): Promise<string> {
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = dataUrl; });
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1a1b1e"; // JPEG has no alpha — match the app's dark surface
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

/**
 * True capture of a block's CONTENTS for its archive: the expanded editor's
 * canvas when this block is open in it (cropped to its item cards), otherwise
 * an offscreen render of the items in their expanded layout — never the tiny
 * collapsed card, which shows the block but not what's inside. Best-effort —
 * returns null on any failure, because an archive without a picture is still
 * an archive.
 */
export async function captureBoxImage(boardId: string, boxId: string): Promise<string | null> {
  try {
    const st = useBoardStore.getState();

    if (st.expandedBoxId === boxId) {
      const node = document.querySelector<HTMLElement>("[data-expanded-canvas]");
      if (node) {
        // Item cards are marked [data-item-card]; crop to their union.
        // On-screen rects are scaled by the editor zoom — divide it back out.
        const cRect = node.getBoundingClientRect();
        const scale = cRect.width / node.offsetWidth || 1;
        const rects = [...node.querySelectorAll("[data-item-card]")].map((el) => {
          const r = el.getBoundingClientRect();
          return { x: (r.left - cRect.left) / scale, y: (r.top - cRect.top) / scale, w: r.width / scale, h: r.height / scale };
        });
        if (rects.length > 0) {
          const PAD = 32;
          const minX = Math.max(0, Math.min(...rects.map((r) => r.x)) - PAD);
          const minY = Math.max(0, Math.min(...rects.map((r) => r.y)) - PAD);
          const width = Math.max(...rects.map((r) => r.x + r.w)) + PAD - minX;
          const height = Math.max(...rects.map((r) => r.y + r.h)) + PAD - minY;
          const board = st.boards.find((b) => b.id === boardId) ?? st.serverBoards[boardId];
          const box = board?.boxes.find((b) => b.id === boxId);
          return await toPng(node, {
            width, height,
            pixelRatio: width * height > 4_000_000 ? 1 : 2,
            backgroundColor: box?.style.backgroundColor ?? "#1a1b1e",
            style: { transform: `translate(${-minX}px, ${-minY}px)`, transformOrigin: "0 0", cursor: "default" },
          });
        }
      }
    }

    return await requestBlockShot(boardId, boxId);
  } catch {
    return null;
  }
}
