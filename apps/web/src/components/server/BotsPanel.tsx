"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Check, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BOT_PERMISSIONS, type BotPermission } from "@/lib/botPermissions";
import { cn } from "@/lib/utils";

interface BotRow {
  id: string;
  name: string;
  avatar: string | null;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString();
}

/** Server Settings → Bots: register programmable bots that act through /api/bot/*. */
export function BotsPanel({ serverId, isReal }: { serverId: string; isReal: boolean }) {
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Set<BotPermission>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Shown exactly once after creation
  const [newToken, setNewToken] = useState<{ botName: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("server_bots")
      .select("id, name, avatar, permissions, created_at, last_used_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false });
    setBots((data as BotRow[]) ?? []);
    setLoading(false);
  }, [serverId]);

  useEffect(() => { if (isReal) void refresh(); }, [isReal, refresh]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, name: name.trim(), permissions: [...perms] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create bot.");
      setNewToken({ botName: json.bot.name, token: json.token });
      setName("");
      setPerms(new Set());
      setCreating(false);
      void refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("server_bots").delete().eq("id", id);
    void refresh();
  };

  if (!isReal) {
    return (
      <div className="max-w-lg">
        <h2 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Bots</h2>
        <p className="text-sm text-[var(--text-muted)]">Bots are only available for real servers.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h2 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Bots</h2>
      <p className="mb-6 text-xs text-[var(--text-muted)]">
        Bots run on your own server and act through a scoped REST API — post to chat, add cards,
        read members. Programmable automation for your board. See <code>docs/bot-api.md</code>.
      </p>

      {/* One-time token reveal */}
      {newToken && (
        <div className="mb-4 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Token for “{newToken.botName}” — copy it now, it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
              {newToken.token}
            </code>
            <button
              onClick={() => { void navigator.clipboard.writeText(newToken.token); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shrink-0"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="self-end text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            I saved it — dismiss
          </button>
        </div>
      )}

      {/* Bot list */}
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading…</p>
      ) : bots.length === 0 && !creating ? (
        <p className="mb-4 text-xs text-[var(--text-muted)]">No bots yet.</p>
      ) : (
        <div className="mb-4 flex flex-col gap-2">
          {bots.map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3">
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-overlay)] text-base shrink-0">
                {b.avatar?.startsWith("http") ? <img src={b.avatar} alt="" className="h-full w-full object-cover" /> : (b.avatar ?? "🤖")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">{b.name}</span>
                  <span className="rounded bg-[var(--accent)]/20 px-1 py-px text-[9px] font-bold uppercase text-[var(--accent)]">Bot</span>
                </div>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {b.permissions.length > 0 ? b.permissions.join(" · ") : "no permissions"} · last used {fmtWhen(b.last_used_at)}
                </p>
              </div>
              <button
                onClick={() => void remove(b.id)}
                title="Delete bot (revokes its token immediately)"
                className="text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      {creating ? (
        <div className="rounded-lg border border-[var(--border)] p-3 flex flex-col gap-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Bot name (e.g. Standup Bot)"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 placeholder:text-[var(--text-muted)]"
          />
          <div className="flex flex-col gap-2">
            {BOT_PERMISSIONS.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[var(--accent)]"
                  checked={perms.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(perms);
                    if (e.target.checked) next.add(p.id); else next.delete(p.id);
                    setPerms(next);
                  }}
                />
                <span className="flex flex-col">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{p.label} <code className="text-[10px] text-[var(--text-muted)]">{p.id}</code></span>
                  <span className="text-[11px] text-[var(--text-muted)]">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
          {errorMsg && <p className="text-[11px] text-red-400">{errorMsg}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setCreating(false); setErrorMsg(""); }} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors">
              Cancel
            </button>
            <button
              onClick={() => void create()}
              disabled={busy || !name.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Bot size={12} /> {busy ? "Creating…" : "Create bot"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          <Plus size={12} /> New bot
        </button>
      )}
    </div>
  );
}
