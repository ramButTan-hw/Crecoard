# Board Bots API

Bots are Crecoard's second extension lane, next to [widgets](widget-api.md):

| | Widgets | Bots |
|---|---|---|
| Runs | in every viewer's browser (sandboxed iframe) | on **your** server/machine |
| Best for | visual items, games, pets, dashboards | automation, moderation, integrations, schedules |
| Acts as | the viewing user (their permissions) | itself, with owner-granted scopes |

## Creating a bot

**Server Settings → Bots → New bot** (owner/admin only). Pick the scopes it needs — the
token is shown **once**; store it like a password. Deleting the bot revokes it instantly.

Authenticate every request with:

```
Authorization: Bot crecoard_bot_...
```

## Scopes

| Scope | Grants |
|---|---|
| `chat:read` | poll chat messages |
| `chat:write` | post chat messages as the bot |
| `board:read` | list boards / fetch full board contents |
| `board:write` | add kanban cards and list entries |
| `members:read` | list server members |

Bots are locked to the server they were created on. Rate limit: 60 requests/min per bot.

## Endpoints

All under your deployment origin (e.g. `https://crecoard.com`).

### `GET /api/bot/me`
Identity check — returns id, server, name, granted scopes. Needs no scope.

### `GET /api/bot/members` — `members:read`
```json
{ "members": [{ "userId": "…", "role": "member", "displayName": "…", "username": "…", "avatarUrl": null }] }
```

### `GET /api/bot/board` and `GET /api/bot/board?boardId=…` — `board:read`
Without `boardId`: list of the server's boards (id, name, updatedAt). With it: the full
board JSON — walk `board.boxes[].items[]` to find item ids (chat items, kanbans, lists).

### `GET /api/bot/chat?boardId=…&itemId=…&since=…&limit=…` — `chat:read`
Messages for one chat item, oldest first, max 100. Poll by passing the last message's
`createdAt` as `since`. Your own messages come back with `isBot: true` — skip them.

### `POST /api/bot/chat` — `chat:write`
```json
{ "boardId": "…", "itemId": "…", "content": "Standup in 10 minutes!" }
```
Appears **live** for everyone via Realtime, authored by the bot's name and avatar.

### `POST /api/bot/kanban-card` — `board:write`
```json
{ "boardId": "…", "itemId": "…", "text": "Review PR #42", "columnId": "col-todo", "due": "2026-07-10", "color": "#48cfa6" }
```
`columnId` optional (defaults to the first column). Cards land on the board on next load.

### `POST /api/bot/list-entry` — `board:write`
```json
{ "boardId": "…", "itemId": "…", "text": "Buy snacks", "due": "2026-07-05" }
```

## Example: a command bot in ~40 lines (Node)

Polls a chat item and replies to `!roll`:

```js
const ORIGIN = "https://crecoard.com";
const TOKEN = process.env.BOT_TOKEN;
const BOARD = "your-board-id", ITEM = "your-chat-item-id";
const H = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

let since = new Date().toISOString();

async function poll() {
  const r = await fetch(`${ORIGIN}/api/bot/chat?boardId=${BOARD}&itemId=${ITEM}&since=${encodeURIComponent(since)}`, { headers: H });
  const { messages = [] } = await r.json();
  for (const m of messages) {
    since = m.createdAt;
    if (m.isBot) continue;
    if (m.content.trim() === "!roll") {
      await fetch(`${ORIGIN}/api/bot/chat`, {
        method: "POST", headers: H,
        body: JSON.stringify({ boardId: BOARD, itemId: ITEM, content: `🎲 ${m.authorName} rolled a ${1 + Math.floor(Math.random() * 6)}!` }),
      });
    }
  }
}

setInterval(poll, 5000);
poll();
```

Swap the command handler and you have a moderation bot (`members:read` + warn via chat),
a standup bot (cron → `POST /api/bot/chat`), or a GitHub bridge (webhook → kanban card).

## Notes & roadmap

- **Chat is the live channel** — bot messages push to viewers instantly. Board writes
  (cards/entries) persist immediately but render for viewers on their next board load.
- **Board writes are last-write-wins** against concurrent edits, same as multi-device sync.
  Bots should append, not fight over items humans are editing.
- Planned: push events (message/member webhooks out to your bot's URL, replacing polling),
  message delete/moderation verbs, a BOT badge in the member list.
