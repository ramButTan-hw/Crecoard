"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, AlertCircle, Settings, ExternalLink,
  Gamepad2, Monitor, ChevronRight,
} from "lucide-react";
import type {
  BlockItem,
  TrackerGGConfig, TrackerGGData, TrackerGGGame, TrackerGGPlatform,
  SteamConfig, SteamData, SteamStatus,
  ExternalItemStyle,
} from "@/store/boardStore";
import { useBoardStore } from "@/store/boardStore";

// ─── Provider meta ────────────────────────────────────────────────────────────

type Provider = "tracker-gg" | "steam";

const PROVIDER_META: Record<Provider, { label: string; Icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>; defaultAccent: string }> = {
  "tracker-gg": { label: "Tracker.gg", Icon: Gamepad2, defaultAccent: "#ff4655" },
  "steam":      { label: "Steam",      Icon: Monitor,  defaultAccent: "#66c0f4" },
};

// ─── Style helper ─────────────────────────────────────────────────────────────

function resolveStyle(item: BlockItem) {
  const provider = item.externalProvider as Provider | undefined;
  let defaultAccent = provider ? PROVIDER_META[provider].defaultAccent : "#d59ee8";
  if (provider === "tracker-gg" && item.trackerGGData?.accentColor) {
    defaultAccent = item.trackerGGData.accentColor;
  }
  const s: ExternalItemStyle = item.externalStyle ?? {};
  return {
    accent:     s.accentColor  ?? defaultAccent,
    bg:         s.bgColor,                        // undefined = var(--surface-raised)
    radius:     s.borderRadius ?? 6,
    compact:    s.compact      ?? false,
    hideHeader: s.hideHeader   ?? false,
    hideFooter: s.hideFooter   ?? false,
  };
}

const STALE_MS = 5 * 60 * 1000;

// ─── Tracker.gg API ───────────────────────────────────────────────────────────

const GAME_LABEL: Record<TrackerGGGame, string> = {
  "valorant":      "VALORANT",
  "apex":          "APEX LEGENDS",
  "rocket-league": "ROCKET LEAGUE",
  "fortnite":      "FORTNITE",
  "csgo":          "CS2",
};

const GAME_PLATFORMS: Record<TrackerGGGame, { value: TrackerGGPlatform; label: string }[]> = {
  "valorant":      [{ value: "riot",   label: "Riot ID (PC)" }],
  "apex":          [{ value: "origin", label: "EA (PC)" }, { value: "psn", label: "PlayStation" }, { value: "xbl", label: "Xbox" }],
  "rocket-league": [{ value: "epic",   label: "Epic" }, { value: "steam", label: "Steam" }, { value: "psn", label: "PlayStation" }, { value: "xbl", label: "Xbox" }],
  "fortnite":      [{ value: "epic",   label: "Epic" }, { value: "psn", label: "PlayStation" }, { value: "xbl", label: "Xbox" }],
  "csgo":          [{ value: "steam",  label: "Steam ID" }],
};

const USERNAME_HINT: Record<TrackerGGGame, string> = {
  "valorant":      "e.g. TenZ#000",
  "apex":          "EA username",
  "rocket-league": "Epic username",
  "fortnite":      "Epic username",
  "csgo":          "Steam ID or vanity URL",
};

async function fetchTrackerData(cfg: TrackerGGConfig): Promise<TrackerGGData> {
  const res = await fetch("/api/integrations/tracker-gg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: cfg.game, platform: cfg.platform, username: cfg.username }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch stats.");
  return json as TrackerGGData;
}

// ─── Steam API ────────────────────────────────────────────────────────────────

const STEAM_STATUS_COLOR: Record<SteamStatus, string> = {
  online:  "#4ade80",
  ingame:  "#66c0f4",
  away:    "#facc15",
  busy:    "#f87171",
  offline: "#6b7280",
};

const STEAM_STATUS_LABEL: Record<SteamStatus, string> = {
  online:  "Online",
  ingame:  "In-Game",
  away:    "Away",
  busy:    "Busy",
  offline: "Offline",
};

function fmtPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`;
}

async function fetchSteamData(cfg: SteamConfig): Promise<SteamData> {
  const res = await fetch("/api/integrations/steam", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: cfg.identifier }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch Steam profile.");
  return json as SteamData;
}

// ─── Provider setup forms ─────────────────────────────────────────────────────

function TrackerGGSetupFields({
  cfg, onSave, onCancel,
}: { cfg?: TrackerGGConfig; onSave: (c: TrackerGGConfig) => void; onCancel?: () => void }) {
  const [game, setGame]         = useState<TrackerGGGame>(cfg?.game ?? "valorant");
  const [platform, setPlatform] = useState<TrackerGGPlatform>(cfg?.platform ?? "riot");
  const [username, setUsername] = useState(cfg?.username ?? "");

  useEffect(() => { setPlatform(GAME_PLATFORMS[game][0].value); }, [game]);

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">Game</span>
        <select value={game} onChange={(e) => setGame(e.target.value as TrackerGGGame)}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
          {(Object.keys(GAME_LABEL) as TrackerGGGame[]).map((g) => (
            <option key={g} value={g}>{GAME_LABEL[g]}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">Platform</span>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as TrackerGGPlatform)}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
          {GAME_PLATFORMS[game].map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && username.trim() && onSave({ game, platform, username: username.trim() })}
          placeholder={USERNAME_HINT[game]}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
      </label>

      <div className="flex gap-2 mt-1">
        <button onClick={() => username.trim() && onSave({ game, platform, username: username.trim() })}
          disabled={!username.trim()}
          className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
          style={{ background: "var(--accent)" }}>
          Load stats
        </button>
        {onCancel && (
          <button onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--surface-overlay)] transition-colors">
            Cancel
          </button>
        )}
      </div>
    </>
  );
}

function SteamSetupFields({
  cfg, onSave, onCancel,
}: { cfg?: SteamConfig; onSave: (c: SteamConfig) => void; onCancel?: () => void }) {
  const [identifier, setIdentifier] = useState(cfg?.identifier ?? "");

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">Steam profile</span>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && identifier.trim() && onSave({ identifier: identifier.trim() })}
          placeholder="username or steamcommunity.com/id/…"
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
        <span className="text-[11px] text-[var(--text-muted)]">
          Vanity URL (e.g. <em>gaben</em>), full profile URL, or 17-digit SteamID64.
        </span>
      </label>

      <div className="flex gap-2 mt-1">
        <button onClick={() => identifier.trim() && onSave({ identifier: identifier.trim() })}
          disabled={!identifier.trim()}
          className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
          style={{ background: "#66c0f4", color: "#000" }}>
          Load profile
        </button>
        {onCancel && (
          <button onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--surface-overlay)] transition-colors">
            Cancel
          </button>
        )}
      </div>
    </>
  );
}

// ─── Setup form (provider picker + config) ────────────────────────────────────

function SetupForm({
  item, onSave, onCancel,
}: {
  item: BlockItem;
  onSave: (provider: Provider, cfg: TrackerGGConfig | SteamConfig) => void;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState<Provider>(
    (item.externalProvider as Provider | undefined) ?? "tracker-gg"
  );

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <p className="text-xs font-semibold text-[var(--text-primary)]">Choose integration</p>

      {/* Provider picker */}
      <div className="grid grid-cols-2 gap-2">
        {(["tracker-gg", "steam"] as Provider[]).map((p) => {
          const { label, Icon, defaultAccent } = PROVIDER_META[p];
          const active = provider === p;
          return (
            <button key={p} onClick={() => setProvider(p)}
              className="flex flex-col items-center gap-1.5 rounded-lg border py-2.5 px-2 text-xs transition-all"
              style={{
                borderColor: active ? defaultAccent : "var(--border)",
                background: active ? defaultAccent + "18" : "var(--surface)",
                color: active ? defaultAccent : "var(--text-secondary)",
              }}>
              <Icon size={16} />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-[var(--border)]" />

      {/* Provider-specific config */}
      {provider === "tracker-gg" ? (
        <TrackerGGSetupFields
          cfg={item.externalProvider === "tracker-gg" ? item.trackerGG : undefined}
          onSave={(cfg) => onSave("tracker-gg", cfg)}
          onCancel={onCancel}
        />
      ) : (
        <SteamSetupFields
          cfg={item.externalProvider === "steam" ? item.steam : undefined}
          onSave={(cfg) => onSave("steam", cfg)}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

// ─── Provider body renders ────────────────────────────────────────────────────

function TrackerGGBody({ item, compact }: { item: BlockItem; compact: boolean }) {
  const data = item.trackerGGData;
  const cfg  = item.trackerGG;
  if (!data || !cfg) return null;

  const accent = resolveStyle(item).accent;

  return (
    <>
      <div className="flex items-center gap-2.5">
        {data.avatarUrl ? (
          <img src={data.avatarUrl} alt="" className="w-9 h-9 rounded-full border flex-shrink-0 object-cover"
            style={{ borderColor: accent }} />
        ) : (
          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
            style={{ background: accent + "33", color: accent }}>
            {data.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{data.username}</p>
          {data.rankLabel && (
            <div className="flex items-center gap-1.5">
              {data.rankIconUrl && <img src={data.rankIconUrl} alt="" className="w-4 h-4 object-contain" />}
              <span className="text-xs font-medium" style={{ color: accent }}>{data.rankLabel}</span>
            </div>
          )}
        </div>
        <a href={`https://tracker.gg/${cfg.game}/profile/${cfg.platform}/${encodeURIComponent(cfg.username)}`}
          target="_blank" rel="noopener noreferrer"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
          <ExternalLink size={11} />
        </a>
      </div>

      {!compact && data.stats.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {data.stats.map((stat) => (
            <div key={stat.key}>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide leading-none mb-0.5">
                {stat.label}
              </p>
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{stat.value}</p>
                {stat.percentile !== undefined && stat.percentile >= 75 && (
                  <span className="text-[10px] font-semibold px-1 rounded-full"
                    style={{ background: accent + "30", color: accent }}>
                    top {100 - Math.round(stat.percentile)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SteamBody({ item, compact }: { item: BlockItem; compact: boolean }) {
  const data = item.steamData;
  if (!data) return null;

  const statusColor = STEAM_STATUS_COLOR[data.status];

  return (
    <>
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          {data.avatarUrl ? (
            <img src={data.avatarUrl} alt="" className="w-10 h-10 rounded border-2 object-cover"
              style={{ borderColor: statusColor }} />
          ) : (
            <div className="w-10 h-10 rounded border-2 flex items-center justify-center text-sm font-bold"
              style={{ borderColor: statusColor, background: "#66c0f422", color: "#66c0f4" }}>
              {data.username.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--surface-raised)]"
            style={{ background: statusColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{data.username}</p>
          <p className="text-xs font-medium" style={{ color: statusColor }}>
            {data.currentGame ?? STEAM_STATUS_LABEL[data.status]}
          </p>
        </div>
        <a href={data.profileUrl} target="_blank" rel="noopener noreferrer"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
          <ExternalLink size={11} />
        </a>
      </div>

      {!compact && data.recentGames.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Recent</p>
          {data.recentGames.map((g) => (
            <div key={g.appId} className="flex items-center gap-2">
              {g.iconUrl ? (
                <img src={g.iconUrl} alt="" className="w-6 h-6 rounded flex-shrink-0 object-cover"
                  style={{ background: "#1b2838" }} />
              ) : (
                <div className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center"
                  style={{ background: "#1b2838" }}>
                  <Monitor size={10} className="text-[#66c0f4]" />
                </div>
              )}
              <span className="text-xs text-[var(--text-primary)] truncate flex-1">{g.name}</span>
              <div className="flex flex-col items-end flex-shrink-0">
                {g.playtime2weeks !== undefined && (
                  <span className="text-[10px] font-semibold text-[#66c0f4]">
                    {fmtPlaytime(g.playtime2weeks)} this week
                  </span>
                )}
                <span className="text-[10px] text-[var(--text-muted)]">
                  {fmtPlaytime(g.playtimeForever)} total
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!compact && data.recentGames.length === 0 && data.status !== "ingame" && (
        <p className="text-xs text-[var(--text-muted)]">No games played in the last 2 weeks.</p>
      )}
    </>
  );
}

// ─── Main ExternalItem component ──────────────────────────────────────────────

interface Props {
  item: BlockItem;
  boardId: string;
  boxId: string;
  collapsed?: boolean;
  isFinished?: boolean;
  onUpdate?: (patch: Partial<BlockItem>) => void;
}

export function ExternalItem({ item, boardId, boxId, collapsed, isFinished, onUpdate }: Props) {
  const updateItem      = useBoardStore((s) => s.updateItem);
  const updateBoardItem = useBoardStore((s) => s.updateBoardItem);

  const upd = useCallback((patch: Partial<BlockItem>) => {
    if (onUpdate) { onUpdate(patch); return; }
    if (boxId) updateItem(boardId, boxId, item.id, patch);
    else       updateBoardItem(boardId, item.id, patch);
  }, [onUpdate, updateItem, updateBoardItem, boardId, boxId, item.id]);

  const provider = item.externalProvider as Provider | undefined;
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(!provider);

  const hasData = provider === "tracker-gg" ? !!item.trackerGGData : !!item.steamData;
  const fetchedAt = provider === "tracker-gg" ? item.trackerGGData?.fetchedAt : item.steamData?.fetchedAt;
  const isStale   = !fetchedAt || Date.now() - fetchedAt > STALE_MS;

  const doFetch = useCallback(async (p: Provider, patch: Partial<BlockItem>) => {
    setLoading(true);
    setError(null);
    try {
      if (p === "tracker-gg") {
        const cfg = (patch.trackerGG ?? item.trackerGG)!;
        const result = await fetchTrackerData(cfg);
        upd({ ...patch, trackerGGData: result });
      } else {
        const cfg = (patch.steam ?? item.steam)!;
        const result = await fetchSteamData(cfg);
        upd({ ...patch, steamData: result });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      if (Object.keys(patch).length > 0) upd(patch); // still save the config
    } finally {
      setLoading(false);
    }
  }, [upd, item.trackerGG, item.steam]);

  useEffect(() => {
    if (provider && isStale && !loading) {
      void doFetch(provider, {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, item.trackerGG?.username, item.steam?.identifier]);

  const st = resolveStyle(item);

  // ── Collapsed view ────────────────────────────────────────────────────────
  if (collapsed) {
    const Icon = provider ? PROVIDER_META[provider].Icon : Gamepad2;
    const label = provider === "tracker-gg"
      ? (item.trackerGGData?.rankLabel ?? item.trackerGG?.username ?? "Tracker.gg")
      : (item.steamData?.username ?? item.steam?.identifier ?? "Steam");
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs truncate" style={{ color: st.accent }}>
        <Icon size={11} className="flex-shrink-0" />
        <span className="font-bold truncate">{label}</span>
      </div>
    );
  }

  // ── Setup form ────────────────────────────────────────────────────────────
  if (showSetup || !provider) {
    return (
      <SetupForm
        item={item}
        onSave={(p, cfg) => {
          const patch: Partial<BlockItem> = {
            externalProvider: p,
            trackerGGData: undefined,
            steamData: undefined,
            ...(p === "tracker-gg" ? { trackerGG: cfg as TrackerGGConfig } : { steam: cfg as SteamConfig }),
          };
          setShowSetup(false);
          void doFetch(p, patch);
        }}
        onCancel={provider ? () => setShowSetup(false) : undefined}
      />
    );
  }

  const Icon = PROVIDER_META[provider].Icon;
  const headerLabel = provider === "tracker-gg"
    ? GAME_LABEL[item.trackerGG?.game ?? "valorant"]
    : "STEAM";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden"
      style={{
        background: st.bg ?? "var(--surface-raised)",
        borderRadius: st.radius,
        border: "1px solid var(--border)",
      }}>

      {/* Header */}
      {!st.hideHeader && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] flex-shrink-0"
          style={{ borderLeftWidth: 3, borderLeftColor: st.accent }}>
          <Icon size={12} style={{ color: st.accent }} className="flex-shrink-0" />
          <span className="text-[11px] font-black tracking-widest flex-1 truncate" style={{ color: st.accent }}>
            {headerLabel}
          </span>
          {!isFinished && (
            <button onClick={() => setShowSetup(true)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Configure">
              <Settings size={12} />
            </button>
          )}
          <button onClick={() => doFetch(provider, {})} disabled={loading}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            title="Refresh">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-3 gap-3">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 leading-snug">{error}</p>
          </div>
        )}

        {loading && !hasData && (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {hasData && provider === "tracker-gg" && (
          <TrackerGGBody item={item} compact={st.compact} />
        )}
        {hasData && provider === "steam" && (
          <SteamBody item={item} compact={st.compact} />
        )}

        {!hasData && !loading && !error && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-[var(--text-muted)]">No data — click refresh.</p>
          </div>
        )}

        {/* Footer */}
        {!st.hideFooter && fetchedAt && (
          <div className="mt-auto pt-1 border-t border-[var(--border)] flex-shrink-0">
            <p className="text-[10px] text-[var(--text-muted)]">
              Updated {new Date(fetchedAt).toLocaleTimeString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Style panel ──────────────────────────────────────────────────────────────

function ColorRow({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] flex-1">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded cursor-pointer border border-[var(--border)] bg-transparent p-0.5" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
    </div>
  );
}

function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] flex-1">{label}</span>
      <button onClick={() => onChange(!checked)}
        className="relative w-8 h-4 rounded-full transition-colors flex-shrink-0"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}>
        <span className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }} />
      </button>
    </div>
  );
}

export function ExternalStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  const provider = item.externalProvider as Provider | undefined;
  const st = resolveStyle(item);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function patch(changes: Partial<ExternalItemStyle>) {
    upd({ externalStyle: { ...(item.externalStyle ?? {}), ...changes } });
  }

  async function handleRefresh() {
    if (!provider) return;
    setLoading(true); setError(null);
    try {
      if (provider === "tracker-gg" && item.trackerGG) {
        const result = await fetchTrackerData(item.trackerGG);
        upd({ trackerGGData: result });
      } else if (provider === "steam" && item.steam) {
        const result = await fetchSteamData(item.steam);
        upd({ steamData: result });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const fetchedAt = provider === "tracker-gg" ? item.trackerGGData?.fetchedAt : item.steamData?.fetchedAt;

  return (
    <div className="flex flex-col gap-5 p-4 text-xs">

      {/* Player info + refresh */}
      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {provider ? PROVIDER_META[provider].label : "Integration"}
        </p>
        {provider === "tracker-gg" && item.trackerGG && (
          <p className="text-[var(--text-secondary)]">
            {GAME_LABEL[item.trackerGG.game]} · {item.trackerGG.username}
          </p>
        )}
        {provider === "steam" && item.steam && (
          <p className="text-[var(--text-secondary)]">{item.steam.identifier}</p>
        )}
        {fetchedAt && (
          <p className="text-[var(--text-muted)]">Last fetched {new Date(fetchedAt).toLocaleString()}</p>
        )}
        {error && <p className="text-red-400">{error}</p>}
        <button onClick={handleRefresh} disabled={loading}
          className="flex items-center gap-1.5 self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors disabled:opacity-50">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          {loading ? "Refreshing…" : "Refresh now"}
        </button>
      </section>

      <div className="h-px bg-[var(--border)]" />

      {/* Color customization */}
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Colors</p>
        <ColorRow label="Accent" value={st.accent} onChange={(v) => patch({ accentColor: v })} />
        <ColorRow
          label="Background"
          value={item.externalStyle?.bgColor ?? "#25262b"}
          onChange={(v) => patch({ bgColor: v })}
        />
        <button onClick={() => patch({ accentColor: undefined, bgColor: undefined })}
          className="self-start text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          Reset to defaults
        </button>
      </section>

      <div className="h-px bg-[var(--border)]" />

      {/* Layout options */}
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Layout</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] flex-1">Corner radius</span>
            <span className="text-[11px] text-[var(--text-muted)] w-6 text-right">{st.radius}</span>
          </div>
          <input type="range" min={0} max={16} step={1} value={st.radius}
            onChange={(e) => patch({ borderRadius: Number(e.target.value) })}
            className="w-full accent-[var(--accent)] h-1" />
        </div>
        <Toggle label="Compact (hide details)"    checked={st.compact}    onChange={(v) => patch({ compact: v })} />
        <Toggle label="Hide header bar"           checked={st.hideHeader} onChange={(v) => patch({ hideHeader: v })} />
        <Toggle label="Hide timestamp footer"     checked={st.hideFooter} onChange={(v) => patch({ hideFooter: v })} />
      </section>
    </div>
  );
}
