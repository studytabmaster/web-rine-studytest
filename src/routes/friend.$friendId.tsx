import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, Phone, UserMinus, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials, type Profile } from "@/lib/rine";

export const Route = createFileRoute("/friend/$friendId")({
  head: () => ({
    meta: [
      { title: "友だちプロフィール｜RINE" },
      {
        name: "description",
        content: "RINE の友だちプロフィール。ひとことやフレンドIDを確認し、トークや通話をすぐに開始できます。",
      },
      { property: "og:title", content: "友だちプロフィール｜RINE" },
      { property: "og:description", content: "プロフィールからトークや通話をすぐに開始。" },
    ],
  }),
  component: FriendProfilePage,
});

function FriendProfilePage() {
  const { friendId } = Route.useParams();
  const { user } = useAuth();
  const { startCall } = useCall();
  const navigate = useNavigate();
  const [friend, setFriend] = useState<Profile | null>(null);

  useEffect(() => {
    void supabase
      .from("profiles")
      .select("*")
      .eq("id", friendId)
      .maybeSingle()
      .then(({ data }) => setFriend((data as Profile) ?? null));
  }, [friendId]);

  const remove = async () => {
    if (!user) return;
    await supabase.from("friendships").delete().eq("user_id", user.id).eq("friend_id", friendId);
    toast.success("友だちから削除しました");
    void navigate({ to: "/friends" });
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg bg-background">
      <div className="relative bg-brand-gradient px-6 pb-10 pt-4 text-center text-primary-foreground">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="absolute left-3 top-3 text-primary-foreground hover:bg-white/20"
          aria-label="戻る"
        >
          <Link to="/friends">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <Avatar className="mx-auto mt-6 size-28 border-4 border-white/30">
          <AvatarImage src={friend?.avatar_url ?? undefined} alt={friend?.display_name ?? ""} />
          <AvatarFallback className="bg-white/20 text-3xl text-primary-foreground">
            {initials(friend?.display_name ?? "?")}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-4 text-2xl font-bold">{friend?.display_name ?? "..."}</h1>
        <p className="mt-1 text-sm opacity-80">
          {friend?.status_message || "ひとことは設定されていません"}
        </p>
        <p className="mt-3 font-mono text-xs opacity-70">ID: {friend?.friend_code ?? "········"}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 px-6 py-6">
        <Button asChild variant="secondary" className="h-20 flex-col rounded-2xl">
          <Link to="/chat/$friendId" params={{ friendId }}>
            <MessageSquare className="size-6" />
            <span className="text-xs">トーク</span>
          </Link>
        </Button>
        <Button
          variant="secondary"
          className="h-20 flex-col rounded-2xl"
          disabled={!friend}
          onClick={() => friend && startCall(friend, false)}
        >
          <Phone className="size-6" />
          <span className="text-xs">音声通話</span>
        </Button>
        <Button
          variant="secondary"
          className="h-20 flex-col rounded-2xl"
          disabled={!friend}
          onClick={() => friend && startCall(friend, true)}
        >
          <Video className="size-6" />
          <span className="text-xs">ビデオ通話</span>
        </Button>
      </div>

      <div className="px-6">
        <Button variant="ghost" className="w-full text-destructive" onClick={remove}>
          <UserMinus className="mr-1 size-4" />
          友だちから削除
        </Button>
      </div>
    </div>
  );
}
