import { supabase } from "@/integrations/supabase/client";

/**
 * 送信取り消し・削除時に、チャットに添付された画像・動画をストレージから物理削除する。
 * 失敗しても呼び出し側の処理は続行できるよう、例外は投げずに結果を返す。
 */
export async function removeChatMedia(paths: (string | null | undefined)[]) {
  const targets = paths.filter((p): p is string => !!p && !p.startsWith("http"));
  if (targets.length === 0) return { removed: 0, error: null as string | null };

  try {
    const { error } = await supabase.storage.from("chat-images").remove(targets);
    if (error) return { removed: 0, error: error.message };
    return { removed: targets.length, error: null };
  } catch (e) {
    return { removed: 0, error: e instanceof Error ? e.message : "unknown" };
  }
}
