import { supabase } from "@/lib/supabase";

/**
 * Post a System activity line (member joined/left, version published, …) into a
 * board's chat. ChatBlock renders messages with author_name "System" as centered
 * event lines. `actorId` must be the acting user — the board_chat_messages insert
 * RLS policy requires author_id = auth.uid().
 */
export async function postChatActivity(opts: {
  boardId: string;
  actorId: string;
  content: string;
  channel?: string;
}): Promise<void> {
  const { boardId, actorId, content, channel = "general" } = opts;
  if (!boardId || !actorId) return;
  const { error } = await supabase.from("board_chat_messages").insert({
    item_id: "system",
    board_id: boardId,
    channel,
    author_id: actorId,
    author_name: "System",
    author_avatar: "📣",
    content,
  });
  if (error) console.error("[chatActivity] failed to post activity:", error.message);
}
