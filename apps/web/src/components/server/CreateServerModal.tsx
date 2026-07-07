"use client";

import { useState } from "react";
import { X, Lock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServers } from "@/contexts/ServersContext";
import type { Server } from "@/types/server";

const ICON_PRESETS = [
  "🌐", "⚡", "🚀", "🎨", "🎯", "💡", "🔥", "🌿",
  "🏆", "📚", "🎸", "🔬", "🎮", "✨", "🌙", "🦋",
];

const inputCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] transition-colors";

interface CreateServerModalProps {
  onClose: () => void;
  onCreated: (server: Server) => void;
}

export function CreateServerModal({ onClose, onCreated }: CreateServerModalProps) {
  const { createServer } = useServers();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🌐");
  const [customIcon, setCustomIcon] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveIcon = customIcon.trim() || icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Server name is required."); return; }
    setError(null);
    setLoading(true);

    const server = await createServer({
      name: name.trim(),
      icon: effectiveIcon,
      description: description.trim(),
      isPublic,
    });

    setLoading(false);
    if (!server) { setError("Failed to create server. Make sure you're signed in."); return; }
    onCreated(server);
  };

  return (
    <>
      <div className="fixed inset-0 z-[1060] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed z-[1061] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden"
        style={{ background: "var(--surface-raised)", width: "min(90vw, 460px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Create a Server</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              A server is a shared board space for your team or community.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="h-px mx-5" style={{ background: "var(--border)" }} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          {/* Icon preview + custom input */}
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-3xl select-none"
              style={{ background: "var(--surface-overlay)", border: "2px solid var(--border)" }}
            >
              {effectiveIcon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Icon — pick or type
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ICON_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => { setIcon(em); setCustomIcon(""); }}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all",
                      icon === em && !customIcon
                        ? "bg-[var(--accent)] text-white scale-110"
                        : "bg-[var(--surface-overlay)] hover:bg-[var(--surface)] hover:scale-105"
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <input
                value={customIcon}
                onChange={(e) => setCustomIcon(e.target.value.slice(0, 2))}
                placeholder="or type 1-2 chars…"
                maxLength={2}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] transition-colors"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Server Name <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design Team"
              maxLength={64}
              required
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Description <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this server for?"
              maxLength={256}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Visibility toggle */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors select-none",
              isPublic
                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                : "border-[var(--border)] hover:border-[var(--border)] bg-[var(--surface-overlay)]"
            )}
            onClick={() => setIsPublic((v) => !v)}
          >
            <div className={cn("flex-shrink-0", isPublic ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
              {isPublic ? <Globe size={18} /> : <Lock size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {isPublic ? "Public server" : "Private server"}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {isPublic
                  ? "Anyone can find and join via invite link"
                  : "Only people with an invite link can join"}
              </p>
            </div>
            <div
              className={cn(
                "h-5 w-9 rounded-full transition-colors flex-shrink-0 relative",
                isPublic ? "bg-[var(--accent)]" : "bg-[var(--border)]"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  isPublic ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className={cn(
                "flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all",
                loading || !name.trim()
                  ? "bg-[var(--accent)]/40 cursor-not-allowed"
                  : "bg-[var(--accent)] hover:opacity-90 active:scale-[0.98]"
              )}
            >
              {loading ? "Creating…" : "Create Server"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
