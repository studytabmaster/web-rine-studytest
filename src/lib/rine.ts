export type Profile = {
  id: string;
  display_name: string;
  status_message: string;
  avatar_url: string | null;
  friend_code: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  image_url: string | null;
  media_type: string;
  read_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type CallSignal = {
  id: string;
  from_user: string;
  to_user: string;
  kind: "offer" | "answer" | "ice" | "end" | "reject" | "ringing" | "unanswered";
  payload: unknown;
  video: boolean;
  created_at: string;
};

export function initials(name: string) {
  return name.trim().slice(0, 2) || "??";
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function formatListTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return formatTime(iso);
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/** 日付区切り用のラベル（今日／昨日／日付） */
export function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今日";
  if (d.toDateString() === yesterday.toDateString()) return "昨日";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

/** 2つの日時が別の日かどうか */
export function isNewDay(prevIso: string | undefined, iso: string) {
  if (!prevIso) return true;
  return new Date(prevIso).toDateString() !== new Date(iso).toDateString();
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export type Group = {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
};

export type GroupMessage = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  media_type: string;
  deleted_at: string | null;
  created_at: string;
};

export type GroupRead = {
  id: string;
  group_id: string;
  user_id: string;
  last_read_at: string;
};

export const UNSENT_TEXT = "メッセージの送信を取り消しました";

/** スタンプ（絵文字ベース、大きく表示する） */
export const STAMPS = ["👍", "❤️", "😂"] as const;

export function isStamp(content: string) {
  return (STAMPS as readonly string[]).includes(content);
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** 添付ファイルを検証して種別を返す */
export function inspectAttachment(file: File):
  | { ok: true; mediaType: "image" | "video" }
  | { ok: false; message: string } {
  if (file.type.startsWith("image/")) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: "画像は10MBまでです" };
    return { ok: true, mediaType: "image" };
  }
  if (file.type.startsWith("video/")) {
    if (file.size > MAX_VIDEO_BYTES) return { ok: false, message: "動画は50MBまでです" };
    return { ok: true, mediaType: "video" };
  }
  return { ok: false, message: "画像または動画を選んでください" };
}
