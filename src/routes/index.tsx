import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, MailOpen, MessageCircleMore } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBlocks } from "@/hooks/useBlocks";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import {
  UNSENT_TEXT, formatListTime, initials, type Message, type Profile } from "@/lib/rine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RINE｜ブラウザで使えるトーク・通話アプリ" },
      {
        name: "description",
        content:
          "RINE はブラウザだけで動くメッセージアプリ。IDで友だち追加して、リアルタイムのトークと音声・ビデオ通話が楽しめます。",
      },
      { property: "og:title", content: "RINE｜ブラウザで使えるトーク・通話アプリ" },
      {
        property: "og:description",
        content: "IDで友だち追加、リアルタイムのトークと無料の音声・ビデオ通話。",
      },
    ],
  }),
  component: TalksPage,
});

type Row = { friend: Profile; last?: Message | undefined; unread: number };

function TalksPage() {
  const { user } = useAuth();
  const { blockedIds } = useBlocks();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", user.id);
      const ids = (links ?? []).map((l) => l.friend_id);
      if (ids.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const [{ data: profiles }, { data: msgs }] = await Promise.all([
        supabase.from("profiles").select("*").in("id", ids),
        supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      const lastByFriend = new Map<string, Message>();
      const unreadByFriend = new Map<string, number>();
      for (const m of (msgs ?? []) as Message[]) {
        const other = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (!lastByFriend.has(other)) lastByFriend.set(other, m);
        if (m.receiver_id === user.id && !m.read_at && !m.deleted_at) {
          unreadByFriend.set(other, (unreadByFriend.get(other) ?? 0) + 1);
        }
      }
      const next = ((profiles ?? []) as Profile[])
        .map((p) => ({
          friend: p,
          last: lastByFriend.get(p.id),
          unread: unreadByFriend.get(p.id) ?? 0,
        }))
        .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
      if (!cancelled) {
        setRows(next);
        setLoading(false);
      }
    };

    void load();

    const channel = supabase
      .channel("talks-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const visible = useMemo(
    () => rows.filter((r) => !blockedIds.includes(r.friend.id)),
    [rows, blockedIds],
  );
  const empty = !loading && visible.length === 0;
  const totalUnread = visible.reduce((sum, r) => sum + r.unread, 0);

  const setThreadRead = async (friendId: string, read: boolean, quiet = false) => {
    if (!user) return;
    let error = null;
    if (read) {
      const res = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", friendId)
        .eq("receiver_id", user.id)
        .is("read_at", null);
      error = res.error;
    } else {
      // 未読に戻すのは直近の受信メッセージ1件だけ
      const { data: latest } = await supabase
        .from("messages")
        .select("id")
        .eq("sender_id", friendId)
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) {
        toast.error("未読にできるメッセージがありません");
        return;
      }
      const res = await supabase
        .from("messages")
        .update({ read_at: null })
        .eq("id", latest.id);
      error = res.error;
    }
    if (error) {
      toast.error("変更できませんでした");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.friend.id === friendId
          ? {
              ...r,
              unread: read ? 0 : Math.max(r.unread, 1),
              last:
                r.last && r.last.sender_id === friendId
                  ? { ...r.last, read_at: read ? new Date().toISOString() : null }
                  : r.last,
            }
          : r,
      ),
    );
    toast.success(read ? "既読にしました" : "未読にしました");
  };

  return (
    <AppShell
      title={totalUnread > 0 ? `トーク (${totalUnread})` : "トーク"}
      action={
        totalUnread > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={async () => {
              for (const r of visible.filter((x) => x.unread > 0)) {
                await setThreadRead(r.friend.id, true);
              }
            }}
          >
            <MailOpen className="mr-1 size-4" />
            すべて既読
          </Button>
        ) : undefined
      }
    >
      {empty ? (
        <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
          <MessageCircleMore className="size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            まだトークがありません。
            <br />
            「友だち」タブでIDを使って友だちを追加しましょう。
          </p>
          <Link to="/friends" className="text-sm font-semibold text-primary hover:underline">
            友だちを追加する
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map(({ friend, last, unread }) => {
            const mineLast = last?.sender_id === user?.id;
            return (
              <li key={friend.id} className="flex items-center">
                <Link
                  to="/friend/$friendId"
                  params={{ friendId: friend.id }}
                  className="shrink-0 py-4 pl-5 pr-1"
                  aria-label={`${friend.display_name} のプロフィール`}
                >
                  <Avatar className="size-12">
                    <AvatarImage src={friend.avatar_url ?? undefined} alt={friend.display_name} />
                    <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                      {initials(friend.display_name)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <Link
                  to="/chat/$friendId"
                  params={{ friendId: friend.id }}
                  className="flex min-w-0 flex-1 items-center gap-3 py-4 pr-2 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate", unread > 0 ? "font-bold" : "font-semibold")}>
                      {friend.display_name}
                    </p>
                    <p
                      className={cn(
                        "truncate text-sm",
                        unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {last
                        ? `${mineLast ? "自分: " : ""}${
                            last.deleted_at
                              ? UNSENT_TEXT
                              : last.image_url
                                ? last.media_type === "video"
                                  ? "動画を送信しました"
                                  : "画像を送信しました"
                                : last.content
                          }`
                        : friend.status_message || "トークを始めましょう"}
                    </p>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {last && (
                      <span className="text-[11px] text-muted-foreground">
                        {formatListTime(last.created_at)}
                      </span>
                    )}
                    {unread > 0 ? (
                      <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[11px] font-bold leading-4 text-primary-foreground">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : mineLast && last?.read_at ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Check className="size-3" />
                        既読
                      </span>
                    ) : null}
                  </span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-2 shrink-0"
                      aria-label={`${friend.display_name} のトーク操作`}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => void setThreadRead(friend.id, unread === 0 ? false : true)}
                    >
                      {unread > 0 ? "既読にする" : "未読にする"}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/friend/$friendId" params={{ friendId: friend.id }}>
                        プロフィール・ブロック
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
