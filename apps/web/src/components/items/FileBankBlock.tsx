"use client";

import { useEffect, useRef, useState } from "react";
import {
  FolderOpen, File, FileText, Image, Video, Archive,
  Download, Plus, Figma,
} from "lucide-react";
import type { BlockItem, FileBankEntry } from "@/store/boardStore";
import { useCanEditBoard } from "@/contexts/ServerBoardContext";
import { useUser } from "@/contexts/UserContext";
import { uploadFile } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface FileBankBlockProps {
  item: BlockItem;
  boardId: string;
  boxId: string;
  expanded?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function rowToEntry(row: Record<string, unknown>): FileBankEntry {
  return {
    id:         String(row.id),
    name:       String(row.name),
    sizeBytes:  Number(row.size_bytes),
    mimeType:   String(row.mime_type),
    uploadedBy: String(row.uploaded_by),
    uploadedAt: String(row.uploaded_at),
    url:        (row.url as string | null) ?? undefined,
  };
}

function FileTypeIcon({ mimeType, size = 14 }: { mimeType: string; size?: number }) {
  const cls = "flex-shrink-0";
  if (mimeType.startsWith("image/"))        return <Image   size={size} className={cn(cls, "text-purple-400")} />;
  if (mimeType === "application/pdf")        return <FileText size={size} className={cn(cls, "text-red-400")} />;
  if (mimeType.includes("figma") || mimeType.includes("sketch")) return <Figma size={size} className={cn(cls, "text-pink-400")} />;
  if (mimeType.startsWith("video/"))         return <Video   size={size} className={cn(cls, "text-blue-400")} />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar")) return <Archive size={size} className={cn(cls, "text-yellow-400")} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileText size={size} className={cn(cls, "text-green-400")} />;
  return <File size={size} className={cn(cls, "text-[var(--text-muted)]")} />;
}

export function FileBankBlock({ item, boardId, expanded = false }: FileBankBlockProps) {
  const canEdit    = useCanEditBoard();
  const { identity } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileBankEntry[]>([]);
  const title = item.fileBankTitle ?? "Files";

  useEffect(() => {
    let cancelled = false;

    // Initial load
    void supabase
      .from("file_bank_files")
      .select("*")
      .eq("item_id", item.id)
      .eq("board_id", boardId)
      .order("uploaded_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setFiles(data.map(rowToEntry as (r: unknown) => FileBankEntry));
      });

    // Real-time inserts
    const channel = supabase
      .channel(`filebank:${item.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "file_bank_files", filter: `item_id=eq.${item.id}` },
        (payload) => {
          const entry = rowToEntry(payload.new as Record<string, unknown>);
          setFiles((prev) => prev.some((f) => f.id === entry.id) ? prev : [...prev, entry]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [item.id, boardId]);

  const handleFileAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const url = await uploadFile(file, identity.userId, "filebank", file.name);
    await supabase.from("file_bank_files").insert({
      item_id:     item.id,
      board_id:    boardId,
      name:        file.name,
      size_bytes:  file.size,
      mime_type:   file.type || "application/octet-stream",
      uploaded_by: identity.displayName,
      uploaded_at: new Date().toISOString(),
      url:         url ?? null,
    });
  };

  return (
    <div className="flex h-full flex-col" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <FolderOpen size={14} className="flex-shrink-0 text-[var(--accent)]" />
        <span className="flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="text-[11px] text-[var(--text-muted)]">{files.length} file{files.length !== 1 ? "s" : ""}</span>
        {canEdit && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--accent)]"
              title="Upload file"
            >
              <Plus size={13} />
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileAdd} />
          </>
        )}
      </div>

      {/* File list */}
      <div
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        style={{ minHeight: 0, scrollbarWidth: "thin" }}
      >
        {files.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
            <FolderOpen size={24} className="text-[var(--text-muted)] opacity-40" />
            <p className="text-xs text-[var(--text-muted)]">
              {canEdit ? "Upload files to share with the team" : "No files uploaded yet"}
            </p>
            {canEdit && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 rounded-lg border border-[var(--accent)] px-3 py-1 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
              >
                Upload file
              </button>
            )}
          </div>
        ) : (
          files.map((f) => <FileRow key={f.id} file={f} expanded={expanded} />)
        )}
      </div>
    </div>
  );
}

function FileRow({ file, expanded }: { file: FileBankEntry; expanded: boolean }) {
  const timeAgo = (iso: string) => {
    const secs = (Date.now() - new Date(iso).getTime()) / 1000;
    if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
    return `${Math.round(secs / 86400)}d ago`;
  };

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-overlay)]">
      <FileTypeIcon mimeType={file.mimeType} size={expanded ? 16 : 14} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium text-[var(--text-primary)]", expanded ? "text-sm" : "text-xs")}>
          {file.name}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {formatBytes(file.sizeBytes)} · {file.uploadedBy} · {timeAgo(file.uploadedAt)}
        </p>
      </div>
      {file.url && (
        <a
          href={file.url}
          download={file.name}
          title="Download"
          className="hidden flex-shrink-0 rounded-lg p-1 text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] group-hover:flex"
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={12} />
        </a>
      )}
    </div>
  );
}
