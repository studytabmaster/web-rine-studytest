import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircleMore } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatListTime, initials, type Message, type Profile } from "@/lib/rine";

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

type Row = { friend: Profile; last?: Message | undefined };

function TalksPage() {
  const { user } = useAuth();
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
          .limit(400),
      ]);
      const lastByFriend = new Map<string, Message>();
      for (const m of (msgs ?? []) as Message[]) {
        const other = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (!lastByFriend.has(other)) lastByFriend.set(other, m);
      }
      const next = ((profiles ?? []) as Profile[])
        .map((p) => ({ friend: p, last: lastByFriend.get(p.id) }))
        .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
      if (!cancelled) {
        setRows(next);
        setLoading(false);
      }
    };

    void load();

    const channel = supabase
      .channel("talks-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
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

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows]);

  return (
    <AppShell title="トーク">
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
          {rows.map(({ friend, last }) => (
            <li key={friend.id}>
              <Link
                to="/chat/$friendId"
                params={{ friendId: friend.id }}
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
              >
                <Avatar className="size-12">
                  <AvatarImage src={friend.avatar_url ?? undefined} alt={friend.display_name} />
                  <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                    {initials(friend.display_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{friend.display_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {last
                      ? `${last.sender_id === user?.id ? "自分: " : ""}${last.image_url ? "画像を送信しました" : last.content}`
                      : friend.status_message || "トークを始めましょう"}
                  </p>
                </div>
                {last && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatListTime(last.created_at)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
