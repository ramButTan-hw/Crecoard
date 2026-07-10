"use client";

import type { BoardOp } from "./collaboration";
import { useBoardStore, suppressUndo } from "@/store/boardStore";

/**
 * Apply a board op received from a remote collaborator to the local store.
 * All type assertions here are intentional — ops arrive as unknown-typed JSON.
 */
export function applyBoardOp(op: BoardOp): void {
  // A peer's edits must not enter THIS client's undo history.
  suppressUndo(() => applyBoardOpInner(op));
}

function applyBoardOpInner(op: BoardOp): void {
  const store = useBoardStore.getState();
  const { boardId } = op;

  switch (op.op) {
    case "moveBox":
      store.moveBox(boardId, op.boxId as string, op.x as number, op.y as number);
      break;

    case "resizeMoveBox":
      store.moveBox(boardId, op.boxId as string, op.x as number, op.y as number);
      store.resizeBox(boardId, op.boxId as string, op.width as number, op.height as number);
      break;

    case "resizeBox":
      store.resizeBox(boardId, op.boxId as string, op.width as number, op.height as number);
      break;

    case "addBox":
      store.addBox(boardId, op.box as Parameters<typeof store.addBox>[1], op.boxId as string);
      break;

    case "removeBox":
      store.removeBox(boardId, op.boxId as string);
      break;

    case "updateBox":
      store.updateBox(boardId, op.boxId as string, op.patch as Parameters<typeof store.updateBox>[2]);
      break;

    case "updateBoxStyle":
      store.updateBoxStyle(boardId, op.boxId as string, op.style as Parameters<typeof store.updateBoxStyle>[2]);
      break;

    case "bringToFront":
      // Only ever broadcast from an explicit "Bring to front" (incidental
      // select/right-click raises are not broadcast), so apply it explicitly
      // to lift a peer's box even if it was pinned to the back.
      store.bringToFront(boardId, op.boxId as string, true);
      break;

    case "sendToBack":
      store.sendToBack(boardId, op.boxId as string);
      break;

    case "addItem":
      store.addItem(boardId, op.boxId as string, op.item as Parameters<typeof store.addItem>[2]);
      break;

    case "removeItem":
      store.removeItem(boardId, op.boxId as string, op.itemId as string);
      break;

    case "updateItem":
      store.updateItem(boardId, op.boxId as string, op.itemId as string, op.patch as Parameters<typeof store.updateItem>[3]);
      break;

    case "replaceBoxItems":
      store.replaceBoxItems(boardId, op.boxId as string, op.items as Parameters<typeof store.replaceBoxItems>[2]);
      break;

    case "addBoardItem":
      store.addBoardItem(boardId, op.item as Parameters<typeof store.addBoardItem>[1]);
      break;

    case "removeBoardItem":
      store.removeBoardItem(boardId, op.itemId as string);
      break;

    case "updateBoardItem":
      store.updateBoardItem(boardId, op.itemId as string, op.patch as Parameters<typeof store.updateBoardItem>[2]);
      break;

    case "moveBoardItem":
      store.moveBoardItem(boardId, op.itemId as string, op.x as number, op.y as number);
      break;

    case "resizeBoardItem":
      store.resizeBoardItem(boardId, op.itemId as string, op.w as number, op.h as number);
      break;
  }
}
