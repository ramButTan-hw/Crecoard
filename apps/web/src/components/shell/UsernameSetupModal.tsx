"use client";

import { useRef, useState } from "react";
import { AtSign, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/contexts/UserContext";

const VALID = /^[a-z0-9_]{3,20}$/;

/**
 * Pick/change the unique username handle. With no `onClose` it's a required,
 * non-dismissible gate; with `onClose` it's an editable dialog.
 */
export function UsernameSetupModal({ current, onClose }: { current?: string; onClose?: () => void }) {
  const { setUsername } = useUser();
  const [value, setValue] = useState(current ?? "");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const required = !onClose;

  const onChange = (raw: string) => {
    const v = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    setValue(v);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    if (v === current) { setStatus("idle"); return; }
    if (!VALID.test(v)) { setStatus(v.length === 0 ? "idle" : "invalid"); return; }
    setStatus("checking");
    timer.current = setTimeout(async () => {
      const { data } = await supabase.rpc("username_available", { p_username: v });
      setStatus(data === false ? "taken" : "available");
    }, 350);
  };

  const canSave = status === "available" && !saving;

  const handleSave = async () => {
    if (!VALID.test(value)) return;
    setSaving(true);
    const res = await setUsername(value);
    setSaving(false);
    if (res.ok) onClose?.();
    else setError(res.error === "taken" ? "That username is taken." : res.error === "invalid" ? "Invalid username." : "Couldn't save — try again.");
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] p-6 shadow-2xl" style={{ background: "var(--surface-raised)" }}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{required ? "Choose a username" : "Change username"}</h2>
          {onClose && (
            <button onClick={onClose} className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={16} /></button>
          )}
        </div>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          {required
            ? "Pick a unique handle so others can find and @mention you. You can change it later."
            : "3–20 characters: lowercase letters, numbers, and underscores."}
        </p>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2.5">
          <AtSign size={15} className="text-[var(--text-muted)]" />
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSave) void handleSave(); }}
            placeholder="username"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {status === "checking" && <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />}
          {status === "available" && <Check size={15} className="text-green-400" />}
          {(status === "taken" || status === "invalid") && <X size={15} className="text-red-400" />}
        </div>

        <div className="mt-1.5 min-h-[18px] text-[11px]">
          {status === "invalid" && <span className="text-red-400">3–20 chars: a–z, 0–9, underscore.</span>}
          {status === "taken" && <span className="text-red-400">@{value} is taken.</span>}
          {status === "available" && <span className="text-green-400">@{value} is available.</span>}
          {error && <span className="text-red-400">{error}</span>}
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="mt-4 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : required ? "Continue" : "Save"}
        </button>
      </div>
    </div>
  );
}
