"use client";

import { X, Lock } from "lucide-react";
import { useBoardStore, useActiveBoard, BoardLevelItem } from "@/store/boardStore";
import { useServerBoard, useServerBoardData } from "@/contexts/ServerBoardContext";
import {
  ListStylePanel, GraphStylePanel, EmbedStylePanel, TimerStylePanel,
  ApiStylePanel, CalendarStylePanel, TableStylePanel, PlaylistStylePanel, KanbanStylePanel, ChatStylePanel, ImageStylePanel, chatChannelsInUse,
} from "@/components/items/ItemRenderer";
import { TextStylePanel } from "@/components/board/ExpandedBlock";
import { ItemEntranceSection } from "@/components/items/ItemRenderer";
import { EmbedCardStylePanel } from "@/components/items/EmbedCardItem";
import { ExternalStylePanel } from "@/components/items/ExternalItem";
import { SuggestionStylePanel, GuestbookStylePanel, PollStylePanel } from "@/components/items/CommunityItems";
import { FlashcardStylePanel, QuizStylePanel } from "@/components/items/StudyItems";
import { VisualizerStylePanel } from "@/components/items/VisualizerItem";
import { TwitchStylePanel } from "@/components/items/TwitchItem";
import { ITEM_DEFINITIONS } from "./ItemPalette";

export function BoardItemPanel() {
  const { activeBoardId, selectedBoardItemId, selectBoardItem, updateBoardItem } = useBoardStore();
  const { boardId: serverBoardId } = useServerBoard();
  const serverBoard = useServerBoardData();
  const personalBoard = useActiveBoard();
  const board = serverBoard ?? personalBoard;
  const boardId = serverBoardId ?? activeBoardId;

  const item = board?.boardItems?.find((i) => i.id === selectedBoardItemId);

  if (!item) return null;

  const upd = (patch: Partial<BoardLevelItem>) =>
    updateBoardItem(boardId, item.id, patch);

  const def = ITEM_DEFINITIONS.find((d) => d.type === item.type);

  return (
    <div
      className="flex w-[300px] flex-shrink-0 flex-col overflow-hidden border-l border-[var(--border)]"
      style={{ background: "var(--surface-raised)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[var(--text-muted)] shrink-0">{def?.icon}</span>
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {def?.label ?? item.type}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] shrink-0">on canvas</span>
        </div>
        <button
          onClick={() => selectBoardItem(null)}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Style panel — same as ExpandedBlock's "Item" tab */}
      <div className="flex-1 overflow-y-auto relative">
        {item.type === "text" && (
          <TextStylePanel item={item} upd={upd} hideCollapsed />
        )}
        {item.type === "list" && (
          <ListStylePanel item={item} upd={upd} />
        )}
        {item.type === "graph" && (
          <GraphStylePanel
            item={item}
            boardId={boardId}
            boxId=""
            upd={upd}
          />
        )}
        {item.type === "embed" && (
          <EmbedStylePanel item={item} upd={upd} />
        )}
        {item.type === "timer" && (
          <TimerStylePanel item={item} upd={upd} />
        )}
        {item.type === "api" && (
          <ApiStylePanel item={item} upd={upd} />
        )}
        {item.type === "calendar" && (
          <CalendarStylePanel item={item} upd={upd} boardId={boardId} boxId="" />
        )}
        {item.type === "table" && (
          <TableStylePanel item={item} upd={upd} boardId={boardId} boxId="" />
        )}
        {item.type === "playlist" && (
          <PlaylistStylePanel item={item} upd={upd} />
        )}
        {item.type === "embed-card" && (
          <EmbedCardStylePanel item={item} upd={upd} />
        )}
        {item.type === "external" && (
          <ExternalStylePanel item={item} upd={upd} />
        )}
        {item.type === "chat" && (
          <ChatStylePanel item={item} upd={upd} usedChannels={chatChannelsInUse(board, item.id)} />
        )}
        {item.type === "suggestion" && (
          <SuggestionStylePanel item={item} upd={upd} />
        )}
        {item.type === "guestbook" && (
          <GuestbookStylePanel item={item} upd={upd} />
        )}
        {item.type === "poll" && (
          <PollStylePanel item={item} upd={upd} />
        )}
        {item.type === "twitch" && (
          <TwitchStylePanel item={item} upd={upd} />
        )}
        {item.type === "image" && (
          <ImageStylePanel item={item} upd={upd} />
        )}
        {item.type === "kanban" && (
          <KanbanStylePanel item={item} upd={upd} />
        )}
        {item.type === "flashcard" && (
          <FlashcardStylePanel item={item} upd={upd} />
        )}
        {item.type === "quiz" && (
          <QuizStylePanel item={item} upd={upd} />
        )}
        {item.type === "visualizer" && (
          <VisualizerStylePanel item={item} upd={upd} />
        )}
        {!["text","list","graph","embed","timer","api","calendar","table","playlist","embed-card","external","chat","suggestion","guestbook","poll","twitch","image","kanban","flashcard","quiz","visualizer"].includes(item.type) && (
          <div className="p-4 text-xs text-[var(--text-muted)]">No style options for this item type.</div>
        )}
        <ItemEntranceSection item={item} upd={upd} />
        {item.settingsLocked && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]" style={{ background: "rgba(26,27,30,0.85)" }}>
            <Lock size={28} className="text-amber-400" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">Settings locked</p>
            <p className="text-xs text-[var(--text-muted)] text-center px-6">Right-click the item and choose "Unlock settings" to make changes.</p>
          </div>
        )}
      </div>

      {/* Size + position controls */}
      <div className="border-t border-[var(--border)] p-4 flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Position &amp; Size</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "X", value: item.boardX, key: "boardX" as const },
            { label: "Y", value: item.boardY, key: "boardY" as const },
            { label: "W", value: item.boardW, key: "boardW" as const },
            { label: "H", value: item.boardH, key: "boardH" as const },
          ].map(({ label, value, key }) => (
            <label key={key} className="flex items-center gap-1.5">
              <span className="w-4 text-[var(--text-muted)]">{label}</span>
              <input
                type="number"
                value={Math.round(value)}
                onChange={(e) => upd({ [key]: Number(e.target.value) })}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
