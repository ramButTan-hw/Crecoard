/**
 * Widget plugin API — the security boundary between community widget code and the app.
 *
 * Widget code runs in a sandboxed iframe (opaque origin, zero app access) and can
 * only ask the host to do things via postMessage:
 *
 *   widget → host:  { type: "plancraft-api", id, method, args }
 *   host → widget:  { type: "plancraft-api-result", id, ok, data | error }
 *
 * The host validates every call: the message must come from that widget's own
 * iframe, the method must exist, the item must hold the required permission
 * (granted by the board owner in the widget's Permissions tab, or consented to
 * at community-install time), args must pass clamps, and calls are rate limited.
 * All mutations then flow through the same store actions a human click uses.
 *
 * Full developer reference: docs/widget-api.md
 */

/** Bumped on breaking protocol changes; widgets can branch on system.getInfo().apiVersion. */
export const WIDGET_API_VERSION = 1;

/** Machine-readable error codes so widget code can branch without string matching. */
export type WidgetApiErrorCode =
  | "UNKNOWN_METHOD"
  | "RATE_LIMITED"
  | "PERMISSION_DENIED"
  | "VIEWER_FORBIDDEN"
  | "BOARD_LOCKED"
  | "INVALID_ARGS"
  | "NO_CONTEXT"
  | "NOT_FOUND";

export type WidgetPermission = "self:move" | "board:read" | "members:read";

export interface WidgetPermissionDef {
  id: WidgetPermission;
  label: string;
  description: string;
}

export const WIDGET_PERMISSIONS: WidgetPermissionDef[] = [
  {
    id: "self:move",
    label: "Move itself",
    description: "Move and resize its own block on this board (visible to everyone).",
  },
  {
    id: "board:read",
    label: "Read board layout",
    description: "See positions, sizes, and titles of blocks on this board — never their contents.",
  },
  {
    id: "members:read",
    label: "See member list",
    description: "Read this server's member names, avatars, roles, and online status.",
  },
];

/** Method → required permission (null = free: a widget may always inspect itself and its host). */
export const METHOD_PERMISSIONS: Record<string, WidgetPermission | null> = {
  "system.getInfo": null,
  "self.getRect": null,
  "self.move": "self:move",
  "self.resize": "self:move",
  "board.getRects": "board:read",
  "members.list": "members:read",
};

export interface WidgetApiRequest {
  type: "plancraft-api";
  id: string | number;
  method: string;
  args?: Record<string, unknown>;
}

export interface WidgetApiResponse {
  type: "plancraft-api-result";
  id: string | number;
  ok: boolean;
  apiVersion: number;
  data?: unknown;
  error?: string;
  code?: WidgetApiErrorCode;
}

/** Coordinate/size clamps — keeps runaway widget code from flinging boxes into deep space. */
export const COORD_LIMIT = 50_000;
export const MIN_SIZE = 40;
export const MAX_SIZE = 4_000;

export function clampCoord(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(v)));
}

export function clampSize(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v)));
}

/** Simple token bucket: `capacity` calls, refilling at `perSecond` per second. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(private capacity = 20, private perSecond = 10) {
    this.tokens = capacity;
    this.last = Date.now();
  }
  allow(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Collect the union of permissions requested by widgets inside template boxes (for install consent). */
export function collectTemplatePermissions(
  boxes: { items: { widgetPermissions?: string[] }[] }[]
): WidgetPermission[] {
  const found = new Set<WidgetPermission>();
  const known = new Set(WIDGET_PERMISSIONS.map((p) => p.id));
  for (const box of boxes) {
    for (const item of box.items) {
      for (const p of item.widgetPermissions ?? []) {
        if (known.has(p as WidgetPermission)) found.add(p as WidgetPermission);
      }
    }
  }
  return [...found];
}
