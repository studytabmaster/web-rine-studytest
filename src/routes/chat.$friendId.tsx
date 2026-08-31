import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Ban, Flag, ImagePlus, MoreVertical, Phone, Send, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { ChatImage } from "@/components/ChatImage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime, initials, type Message, type Profile } from "@/lib/rine";
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
      .channel(`chat-${friendId}`)
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

  // 受信したメッセージを既読にする
  useEffect(() => {
    if (!user) return;
    const unread = messages.filter((m) => m.receiver_id === user.id && !m.read_at);
    if (unread.length === 0) return;
    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((m) => m.id),
      );
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
    const { error } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, receiver_id: friendId, content });
    if (error) {
      toast.error("送信できませんでした");
      setText(content);
    }
  };

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (blocked) {
      toast.error("ブロック中の相手には送信できません");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選んでください");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("画像は10MBまでです");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("chat-images")
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast.error("画像をアップロードできませんでした");
      return;
    }
    const { error } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, receiver_id: friendId, content: "", image_url: path });
    setUploading(false);
    if (error) toast.error("画像を送信できませんでした");
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
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex items-end gap-1", mine && "flex-row-reverse")}>
              <div
                className={cn(
                  "max-w-[72%] shadow-soft",
                  m.image_url
                    ? "overflow-hidden rounded-2xl"
                    : cn(
                        "rounded-2xl px-3.5 py-2 text-sm",
                        mine ? "bubble-out rounded-br-sm" : "bubble-in rounded-bl-sm",
                      ),
                )}
              >
                {m.image_url ? (
                  <ChatImage path={m.image_url} />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
              </div>
              <span
                className={cn(
                  "flex flex-col pb-1 text-[10px] text-foreground/50",
                  mine ? "items-end" : "items-start",
                )}
              >
                {mine && m.read_at && <span className="text-foreground/60">既読</span>}
                {formatTime(m.created_at)}
              </span>
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
          accept="image/*"
          className="hidden"
          onChange={pickImage}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="画像を送る"
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
