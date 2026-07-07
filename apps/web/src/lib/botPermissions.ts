/**
 * Bot permission scopes — client-safe registry (no Node imports).
 * The server-side gate lives in lib/botAuth.ts; the management UI renders these.
 */

export type BotPermission = "chat:read" | "chat:write" | "board:read" | "board:write" | "members:read";

export const BOT_PERMISSIONS: { id: BotPermission; label: string; description: string }[] = [
  { id: "chat:read",    label: "Read chat",    description: "Poll messages from chat items on this server's boards" },
  { id: "chat:write",   label: "Post chat",    description: "Send messages to chat items as the bot (appears live)" },
  { id: "board:read",   label: "Read boards",  description: "Fetch full board contents for this server" },
  { id: "board:write",  label: "Write boards", description: "Add kanban cards and list entries to board items" },
  { id: "members:read", label: "List members", description: "Read member names, roles, and profiles" },
];

export const BOT_TOKEN_PREFIX = "crecoard_bot_";
