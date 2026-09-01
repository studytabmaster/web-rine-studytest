import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Copy, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initials } from "@/lib/rine";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "マイプロフィール｜RINE" },
      {
        name: "description",
        content:
          "RINE のプロフィール設定。表示名・ひとこと・アイコンを編集し、自分のフレンドIDを友だちに共有できます。",
      },
      { property: "og:title", content: "マイプロフィール｜RINE" },
      { property: "og:description", content: "表示名やひとこと、アイコンを編集しよう。" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, refreshProfile, signOut, user } = useAuth();
  const { permission, requestPermission } = useNotifications();
  const [displayName, setDisplayName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const notificationLabel =
    permission === "granted"
      ? "通知 ON"
      : permission === "denied"
        ? "通知が拒否されています"
        : "通知を許可";
  const notificationDisabled = permission === "granted" || permission === "denied" || permission === "unsupported";

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setStatusMessage(profile.status_message);
    setAvatarUrl(profile.avatar_url ?? "");
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || "ユーザー",
        status_message: statusMessage,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error("保存できませんでした");
      return;
    }
    await refreshProfile();
    toast.success("プロフィールを保存しました");
  };

  /** 画像ファイルをアップロードし、長期の署名付きURLをアイコンに設定する */
  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選んでください");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("5MB以下の画像を選んでください");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      const { data, error: signErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !data?.signedUrl) throw signErr ?? new Error("URLを作成できませんでした");

      setAvatarUrl(data.signedUrl);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: data.signedUrl })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("アイコンを更新しました");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "アップロードできませんでした");
    } finally {
      setUploading(false);
    }
  };


  const copyCode = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.friend_code);
      toast.success("フレンドIDをコピーしました");
    } catch {
      toast.error(`コピーできませんでした（ID: ${profile.friend_code}）`);
    }
  };

  return (
    <AppShell title="プロフィール">
      <div className="bg-brand-gradient px-6 pb-10 pt-8 text-center text-primary-foreground">
        <Avatar className="mx-auto size-24 border-4 border-white/30">
          <AvatarImage src={avatarUrl || undefined} alt={displayName} />
          <AvatarFallback className="bg-white/20 text-2xl text-primary-foreground">
            {initials(displayName || "R")}
          </AvatarFallback>
        </Avatar>
        <p className="mt-4 text-xl font-bold">{displayName || "ユーザー"}</p>
        <p className="text-sm opacity-80">{statusMessage || "ひとことを設定しましょう"}</p>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">あなたのフレンドID</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.25em]">
              {profile?.friend_code ?? "········"}
            </span>
            <Button variant="outline" size="sm" onClick={copyCode}>
              <Copy className="mr-1 size-4" />
              コピー
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            このIDを友だちに伝えると、追加してもらえます。IDは登録時に自動で割り当てられ、変更できません。
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">表示名</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">ひとこと</Label>
            <Textarea
              id="status"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              maxLength={100}
              rows={2}
              placeholder="今日もいい日"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatar-file">アイコン画像をアップロード</Label>
            <input
              id="avatar-file"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadAvatar(f);
              }}
              className="w-full text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {uploading ? "アップロード中..." : "JPG・PNG・GIF（5MBまで）"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatar">アイコン画像のURL（任意）</Label>
            <Input
              id="avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <Button variant="brand" size="pill" className="w-full" onClick={save} disabled={busy}>
            保存する
          </Button>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => void requestPermission()}
          disabled={notificationDisabled}
        >
          <Bell className="mr-1 size-4" />
          {notificationLabel}
        </Button>

        <Button variant="ghost" className="w-full text-destructive" onClick={() => void signOut()}>
          <LogOut className="mr-1 size-4" />
          ログアウト
        </Button>

        <div className="flex items-center justify-center gap-4 pb-2 text-xs text-muted-foreground">
          <Link to="/terms" className="underline hover:text-foreground">
            利用規約
          </Link>
          <Link to="/privacy" className="underline hover:text-foreground">
            プライバシーポリシー
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
