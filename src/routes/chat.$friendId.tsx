import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Phone, Send, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
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
  const [friend, setFriend] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user, friendId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !user) return;
    setText("");
    const { error } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, receiver_id: friendId, content });
    if (error) {
      toast.error("送信できませんでした");
      setText(content);
    }
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
          <span className="truncate font-semibold">{friend?.display_name ?? "..."}</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="音声通話"
          disabled={!friend}
          onClick={() => friend && startCall(friend, false)}
        >
          <Phone className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="ビデオ通話"
          disabled={!friend}
          onClick={() => friend && startCall(friend, true)}
        >
          <Video className="size-5" />
        </Button>
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
                  "max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-soft",
                  mine ? "bubble-out rounded-br-sm" : "bubble-in rounded-bl-sm",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
              <span className="pb-1 text-[10px] text-foreground/50">
                {formatTime(m.created_at)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-border bg-background px-3 py-3"
      >
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
    </div>
  );
}
