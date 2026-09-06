import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Ban, Copy, Flag, ImagePlus, MoreVertical, Phone, Send, Smile, Undo2, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { removeChatMedia } from "@/lib/media-cleanup";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { useBlocks } from "@/hooks/useBlocks";
import { useNotifications } from "@/hooks/useNotifications";
import { ReportDialog } from "@/components/ReportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatMedia } from "@/components/ChatMedia";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  STAMPS,
  UNSENT_TEXT,
  formatDateLabel,
  formatTime,
  initials,
  inspectAttachment,
  isNewDay,
  isStamp,
  type Message,
  type Profile,
} from "@/lib/rine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat/$friendId")({
  head: () => ({
    meta: [
      { title: "トークルーム｜RINE" },
      {
        name: "description",
        content: "RINE のトークルーム。リアルタイムでメッセージを送り、そのまま音声・ビデオ通話も。",
      },
      { property: "og:title", content: "トークルーム｜RINE" },
      { property: "og:description", content: "リアルタイムのトークとワンタップ通話。" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { friendId } = Route.useParams();
  const { user, loading } = useAuth();
  const { startCall } = useCall();
  const { isBlocked, block, unblock } = useBlocks();
  const { sendNotification } = useNotifications();
  const blocked = isBlocked(friendId);
  const [friend, setFriend] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const friendRef = useRef<Profile | null>(null);
  const markedRef = useRef<Set<string>>(new Set());
  friendRef.current = friend;


  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const [{ data: p }, { data: msgs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", friendId).maybeSingle(),
        supabase
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`,
          )
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setFriend((p as Profile) ?? null);
      setMessages((msgs ?? []) as Message[]);
    };

    void load();

    const channel = supabase
      .channel(`chat-${friendId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          const mine =
            (m.sender_id === user.id && m.receiver_id === friendId) ||
            (m.sender_id === friendId && m.receiver_id === user.id);
          if (!mine) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id === friendId) {
            sendNotification(friendRef.current?.display_name || "新着メッセージ", {
              body: m.image_url ? (m.media_type === "video" ? "[動画]" : "[画像]") : m.content,
              tag: `chat-${friendId}`,
            });
          }
        },
      )

      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user, friendId]);

  // 受信したメッセージを既読にする（同じIDは一度だけ更新する）
  useEffect(() => {
    if (!user) return;
    const unread = messages.filter(
      (m) => m.receiver_id === user.id && !m.read_at && !markedRef.current.has(m.id),
    );
    if (unread.length === 0) return;
    const ids = unread.map((m) => m.id);
    ids.forEach((id) => markedRef.current.add(id));
    const now = new Date().toISOString();
    void supabase
      .from("messages")
      .update({ read_at: now })
      .in("id", ids)
      .then(({ error }) => {
        if (error) {
          ids.forEach((id) => markedRef.current.delete(id));
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (ids.includes(m.id) ? { ...m, read_at: m.read_at ?? now } : m)),
        );
      });
  }, [messages, user]);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !user) return;
    if (blocked) {
      toast.error("ブロック中の相手には送信できません");
      return;
    }
    setText("");
    // 楽観的に即表示 → サーバー確定行で置き換え（送信ラグ対策）
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: friendId,
      content,
      image_url: null,
      media_type: "image",
      read_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, receiver_id: friendId, content })
      .select("*")
      .maybeSingle();
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error("送信できませんでした");
      setText(content);
      return;
    }
    if (data) {
      const row = data as Message;
      setMessages((prev) =>
        prev.some((m) => m.id === row.id)
          ? prev.filter((m) => m.id !== tempId)
          : prev.map((m) => (m.id === tempId ? row : m)),
      );
    }
  };

  /** スタンプを送信する（テキストメッセージとして保存し、大きく描画する） */
  const sendStamp = async (stamp: string) => {
    if (!user || blocked) return;
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, receiver_id: friendId, content: stamp })
      .select("*")
      .maybeSingle();
    if (error) {
      toast.error("送信できませんでした");
      return;
    }
    if (data) {
      const row = data as Message;
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    }
  };

  const pickMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (blocked) {
      toast.error("ブロック中の相手には送信できません");
      return;
    }
    const check = inspectAttachment(file);
    if (!check.ok) {
      toast.error(check.message);
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || (check.mediaType === "video" ? "mp4" : "jpg");
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("chat-images")
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast.error("アップロードできませんでした");
      return;
    }
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id: friendId,
        content: "",
        image_url: path,
        media_type: check.mediaType,
      })
      .select("*")
      .maybeSingle();
    setUploading(false);
    if (error) {
      toast.error("送信できませんでした");
      return;
    }
    if (data) {
      const row = data as Message;
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    }
  };


  const unsend = async (id: string) => {
    // 取り消し対象の添付ファイルをストレージからも物理削除する
    const target = messages.find((m) => m.id === id);
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), content: "", image_url: null })
      .eq("id", id);
    if (error) {
      toast.error("取り消せませんでした");
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, deleted_at: new Date().toISOString(), content: "", image_url: null }
          : m,
      ),
    );
    if (target?.image_url) {
      const { error: mediaError } = await removeChatMedia([target.image_url]);
      if (mediaError) console.warn("media cleanup failed", mediaError);
    }
    toast.success("送信を取り消しました");
  };

  if (loading) return null;

  return (
    <div className="mx-auto flex h-screen w-full max-w-lg flex-col bg-chat">
      <header className="flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label="戻る">
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <Link
          to="/friend/$friendId"
          params={{ friendId }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Avatar className="size-9">
            <AvatarImage src={friend?.avatar_url ?? undefined} alt={friend?.display_name ?? ""} />
            <AvatarFallback className="bg-brand-gradient text-xs text-primary-foreground">
              {initials(friend?.display_name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight">
              {friend?.display_name ?? "..."}
            </span>
            <span className="block font-mono text-[11px] leading-tight text-muted-foreground">
              ID: {friend?.friend_code ?? "········"}
            </span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="音声通話"
          disabled={!friend || blocked}
          onClick={() => friend && startCall(friend, false)}
        >
          <Phone className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="ビデオ通話"
          disabled={!friend || blocked}
          onClick={() => friend && startCall(friend, true)}
        >
          <Video className="size-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="メニュー">
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={async () => {
                if (blocked) {
                  if (await unblock(friendId)) toast.success("ブロックを解除しました");
                } else if (await block(friendId)) {
                  toast.success("ブロックしました");
                }
              }}
            >
              <Ban className="mr-2 size-4" />
              {blocked ? "ブロックを解除" : "ブロックする"}
            </DropdownMenuItem>
            {friend && (
              <ReportDialog
                targetId={friend.id}
                targetName={friend.display_name}
                targetCode={friend.friend_code}
                context="direct"
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Flag className="mr-2 size-4" />
                    通報する
                  </DropdownMenuItem>
                }
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-foreground/50">
            メッセージを送ってトークを始めましょう
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const unsent = !!m.deleted_at;
          const showDay = isNewDay(messages[i - 1]?.created_at, m.created_at);
          const bubble = (
            <div
              className={cn(
                "shadow-soft",
                (m.image_url || isStamp(m.content)) && !unsent
                  ? "overflow-hidden rounded-2xl"
                  : cn(
                      "rounded-2xl px-3.5 py-2 text-sm",
                      unsent
                        ? "border border-dashed border-foreground/20 bg-background/60 italic text-foreground/50"
                        : mine
                          ? "bubble-out rounded-br-sm"
                          : "bubble-in rounded-bl-sm",
                    ),
              )}
            >
              {unsent ? (
                <p>{UNSENT_TEXT}</p>
              ) : m.image_url ? (
                <ChatMedia path={m.image_url} mediaType={m.media_type} />
              ) : isStamp(m.content) ? (
                <p className="px-1 text-6xl leading-none">{m.content}</p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
            </div>
          );

          const copy = async () => {
            try {
              await navigator.clipboard.writeText(m.content);
              toast.success("コピーしました");
            } catch {
              toast.error("コピーできませんでした");
            }
          };

          return (
            <div key={m.id}>
              {showDay && (
                <div className="flex justify-center py-3">
                  <span className="rounded-full bg-foreground/10 px-3 py-1 text-[11px] text-foreground/60">
                    {formatDateLabel(m.created_at)}
                  </span>
                </div>
              )}
              <div className={cn("flex items-end gap-1.5", mine && "flex-row-reverse")}>
                {!mine && (
                  <Link to="/friend/$friendId" params={{ friendId }} className="shrink-0">
                    <Avatar className="size-7">
                      <AvatarImage
                        src={friend?.avatar_url ?? undefined}
                        alt={friend?.display_name ?? ""}
                      />
                      <AvatarFallback className="text-[10px]">
                        {initials(friend?.display_name ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                )}
                <div className={cn("max-w-[72%]", mine ? "items-end" : "items-start")}>
                  {!mine && (
                    <p className="mb-0.5 text-[11px] text-foreground/60">
                      {friend?.display_name ?? "友だち"}
                      {friend && (
                        <span className="ml-1 font-mono text-[9px] text-foreground/40">
                          ID:{friend.friend_code}
                        </span>
                      )}
                    </p>
                  )}
                  {unsent ? (
                    bubble
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="w-full text-left">
                          {bubble}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={mine ? "end" : "start"}>
                        {m.content && (
                          <DropdownMenuItem onSelect={() => void copy()}>
                            <Copy className="mr-2 size-4" />
                            コピー
                          </DropdownMenuItem>
                        )}
                        {mine ? (
                          <DropdownMenuItem onSelect={() => void unsend(m.id)}>
                            <Undo2 className="mr-2 size-4" />
                            送信を取り消す
                          </DropdownMenuItem>
                        ) : friend ? (
                          <ReportDialog
                            targetId={friend.id}
                            targetName={friend.display_name}
                            targetCode={friend.friend_code}
                            context="direct"
                            messageId={m.id}
                            messageContent={m.content || "(メディア)"}
                            trigger={
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <Flag className="mr-2 size-4" />
                                このメッセージを通報
                              </DropdownMenuItem>
                            }
                          />
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <span
                  className={cn(
                    "flex flex-col pb-1 text-[10px] text-foreground/50",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  {mine && !unsent && (
                    <span className="text-foreground/60">{m.read_at ? "既読" : "未読"}</span>
                  )}
                  {formatTime(m.created_at)}
                </span>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {blocked ? (
        <div className="border-t border-border bg-background px-5 py-4 text-center text-sm text-muted-foreground">
          この相手をブロック中です。メッセージの送受信はできません。
          <button
            type="button"
            className="ml-1 font-semibold text-primary hover:underline"
            onClick={async () => {
              if (await unblock(friendId)) toast.success("ブロックを解除しました");
            }}
          >
            解除する
          </button>
        </div>
      ) : (
      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-border bg-background px-3 py-3"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={pickMedia}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="画像・動画を送る"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-5" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="メッセージを入力"
          className="rounded-full"
        />

        <Button type="submit" variant="brand" size="icon" className="rounded-full" aria-label="送信">
          <Send className="size-4" />
        </Button>
      </form>
      )}
    </div>
  );
}
