"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBoardStore } from "@/store/boardStore";
import { useHasAppBg } from "@/lib/useHasAppBg";
import { cn } from "@/lib/utils";

// ─── Sortable tab item ────────────────────────────────────────────────────────

interface SortableTabProps {
  boardId: string;
  boardName: string;
  isPublic: boolean;
  isActive: boolean;
  showClose: boolean;
  renamingId: string | null;
  inputValue: string;
  noDrag: React.CSSProperties | undefined;
  onActivate: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onInputChange: (v: string) => void;
  onInputBlur: () => void;
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function SortableTab({
  boardId, boardName, isPublic, isActive, showClose,
  renamingId, inputValue, noDrag,
  onActivate, onRemove, onDoubleClick,
  onInputChange, onInputBlur, onInputKeyDown,
}: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: boardId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...noDrag,
  };

  const isRenaming = renamingId === boardId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      tabIndex={0}
      role="button"
      aria-label={`Drag to reorder ${boardName}`}
      className={cn(
        "group flex h-7 max-w-[180px] min-w-[100px] items-center gap-1.5 rounded-t px-3 text-sm cursor-pointer select-none transition-colors flex-shrink-0",
        isActive
          ? "bg-[var(--surface)] text-[var(--text-primary)] border border-b-transparent border-[var(--border)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
      )}
      onClick={onActivate}
    >
      {isPublic ? (
        <span className="text-[11px] text-green-400" title="Public">●</span>
      ) : (
        <span className="text-[11px] text-[var(--text-muted)]" title="Private">●</span>
      )}

      {isRenaming ? (
        <input
          autoFocus
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onBlur={onInputBlur}
          onKeyDown={onInputKeyDown}
          onClick={(e) => e.stopPropagation()}
          // stopPropagation prevents dnd-kit from starting a drag while the
          // rename input is focused. On touch devices this is a known dnd-kit
          // limitation: native text-cursor repositioning may be partially
          // affected, but it is the minimal correct tradeoff here.
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text-primary)] border-b border-[var(--accent)]"
          style={{ fontSize: "inherit" }}
        />
      ) : (
        <span
          className="flex-1 truncate"
          onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
        >
          {boardName}
        </span>
      )}

      {showClose && (
        <button
          onClick={onRemove}
          onPointerDown={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-opacity"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

// ─── BoardTabs ────────────────────────────────────────────────────────────────

export function BoardTabs() {
  const { boards, activeBoardId, setActiveBoard, addBoard, removeBoard } = useBoardStore();
  const reorderBoards = useBoardStore((s) => s.reorderBoards);
  const hasAppBg = useHasAppBg();
  const [isDesktop, setIsDesktop] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const commitRename = useRef<(() => void) | null>(null);

  // Only show active personal boards — server boards are via server nav
  const personalBoards = boards.filter((b) => !b.serverId && !b.deletedAt);
  const boardIds = personalBoards.map((b) => b.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleAddBoard = () => {
    // Commit any in-progress rename first
    if (renamingId && commitRename.current) {
      commitRename.current();
    }
    addBoard("New Board");
    // We need the new board's id — it's set as activeBoardId after addBoard
    // We read it in a microtask so the store has updated
    Promise.resolve().then(() => {
      const newId = useBoardStore.getState().activeBoardId;
      setInputValue("");
      setRenamingId(newId);
    });
  };

  const startRename = (boardId: string, currentName: string) => {
    setInputValue(currentName);
    setRenamingId(boardId);
  };

  const buildCommit = (boardId: string) => () => {
    const name = inputValueRef.current.trim() || "Untitled";
    updateBoard(boardId, { name });
    setRenamingId(null);
  };

  // Keep commit ref fresh so onBlur always uses the latest inputValue
  useEffect(() => {
    if (!renamingId) return;
    commitRename.current = buildCommit(renamingId);
  });

  const handleInputBlur = () => {
    commitRename.current?.();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { commitRename.current?.(); }
    if (e.key === "Escape") { setRenamingId(null); }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = boardIds.indexOf(active.id as string);
    const toIndex = boardIds.indexOf(over.id as string);
    if (fromIndex < 0 || toIndex < 0) return;
    const newOrder = arrayMove(boardIds, fromIndex, toIndex);
    reorderBoards(newOrder);
  };

  const noDrag = isDesktop ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined;

  return (
    <DndContext id="dnd-board-tabs" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div
        className={cn("flex h-9 items-center gap-0.5 border-b border-[var(--border)] px-2 overflow-x-auto flex-shrink-0", isDesktop && "select-none")}
        style={{
          background: hasAppBg ? "transparent" : "var(--surface-raised)",
          ...(isDesktop ? { WebkitAppRegion: "drag" } as React.CSSProperties : {}),
        }}
      >
        <SortableContext items={boardIds} strategy={horizontalListSortingStrategy}>
          {personalBoards.map((board) => (
            <SortableTab
              key={board.id}
              boardId={board.id}
              boardName={board.name}
              isPublic={board.isPublic}
              isActive={board.id === activeBoardId}
              showClose={personalBoards.length > 1}
              renamingId={renamingId}
              inputValue={inputValue}
              noDrag={noDrag}
              onActivate={() => setActiveBoard(board.id)}
              onRemove={(e) => { e.stopPropagation(); removeBoard(board.id); }}
              onDoubleClick={() => startRename(board.id, board.name)}
              onInputChange={setInputValue}
              onInputBlur={handleInputBlur}
              onInputKeyDown={handleInputKeyDown}
            />
          ))}
        </SortableContext>

        <button
          onClick={handleAddBoard}
          disabled={personalBoards.length >= 3}
          style={noDrag}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
          title={personalBoards.length >= 3 ? "Board limit reached (3 max)" : "New board"}
        >
          <Plus size={14} />
        </button>
      </div>
    </DndContext>
  );
}
