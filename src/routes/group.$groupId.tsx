import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, LogOut, Send, Settings, Trash2, Undo2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { removeChatMedia } from "@/lib/media-cleanup";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { ChatMedia } from "@/components/ChatMedia";
import { ReportDialog } from "@/components/ReportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  UNSENT_TEXT,
  formatDateLabel,
  formatTime,
  initials,
  inspectAttachment,
  isNewDay,
  type Group,
  type GroupMessage,
  type GroupRead,
  type Profile,
} from "@/lib/rine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/group/$groupId")({
  head: () => ({
    meta: [
      { title: "グループトークルーム｜RINE" },
      {
        name: "description",
        content: "RINE のグループトークルーム。メンバー全員とリアルタイムでメッセージや画像を共有できます。",
      },
      { property: "og:title", content: "グループトークルーム｜RINE" },
      { property: "og:description", content: "メンバー全員とリアルタイムでトーク。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupChatPage,
});

function GroupChatPage() {
  const { groupId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { sendNotification } = useNotifications();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [reads, setReads] = useState<GroupRead[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const membersRef = useRef<Profile[]>([]);
  const groupRef = useRef<Group | null>(null);
  membersRef.current = members;
  groupRef.current = group;
  const isOwner = !!user && group?.owner_id === user.id;


  const loadMembers = useCallback(async () => {
    const { data: rows } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);
    const ids = (rows ?? []).map((r) => r.user_id);
    if (ids.length === 0) {
      setMembers([]);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").in("id", ids);
    setMembers((data ?? []) as Profile[]);
  }, [groupId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const [{ data: g }, { data: msgs }] = await Promise.all([
        supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
        supabase
          .from("group_messages")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setGroup((g as Group) ?? null);
      setMessages((msgs ?? []) as GroupMessage[]);
      void loadMembers();
    };

    void load();

    const channel = supabase
      .channel(`group-${groupId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const m = payload.new as GroupMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== user?.id) {
            const sender = membersRef.current.find((p) => p.id === m.sender_id);
            sendNotification(
              `${groupRef.current?.name || "グループ"} - ${sender?.display_name || "メンバー"}`,
              {
                body: m.image_url ? (m.media_type === "video" ? "[動画]" : "[画像]") : m.content,
                tag: `group-${groupId}`,
              },
            );
          }

        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const m = payload.new as GroupMessage;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user, groupId, loadMembers]);

  // 自分の既読位置を更新し、メンバーの既読状況を取得する
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const sync = async () => {
      await supabase
        .from("group_reads")
        .upsert(
          { group_id: groupId, user_id: user.id, last_read_at: new Date().toISOString() },
          { onConflict: "group_id,user_id" },
        );
      const { data } = await supabase
        .from("group_reads")
        .select("id, group_id, user_id, last_read_at")
        .eq("group_id", groupId);
      if (!cancelled) setReads((data ?? []) as GroupRead[]);
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [user, groupId, messages.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`group-reads-${groupId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_reads", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const r = payload.new as GroupRead;
          if (!r?.id) return;
          setReads((prev) =>
            prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r],
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !user) return;
    setText("");
    // 楽観的に即表示 → サーバー確定行で置き換え（送信ラグ対策）
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: GroupMessage = {
      id: tempId,
      group_id: groupId,
      sender_id: user.id,
      content,
      image_url: null,
      media_type: "image",
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const { data, error } = await supabase
      .from("group_messages")
      .insert({ group_id: groupId, sender_id: user.id, content })
      .select("*")
      .maybeSingle();
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error("送信できませんでした");
      setText(content);
      return;
    }
    if (data) {
      const row = data as GroupMessage;
      setMessages((prev) =>
        prev.some((m) => m.id === row.id)
          ? prev.filter((m) => m.id !== tempId)
          : prev.map((m) => (m.id === tempId ? row : m)),
      );
    }
  };

  const pickMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
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
      .from("group_messages")
      .insert({
        group_id: groupId,
        sender_id: user.id,
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
      const row = data as GroupMessage;
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    }
  };


  const unsend = async (id: string) => {
    // 取り消し対象の添付ファイルをストレージからも物理削除する
    const target = messages.find((m) => m.id === id);
    const { error } = await supabase
      .from("group_messages")
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

  const leave = async () => {
    if (!user || isOwner) return;
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id);
    if (error) {
      toast.error("退出できませんでした");
      return;
    }
    toast.success("グループを退出しました");
    void navigate({ to: "/groups" });
  };

  const deleteGroup = async () => {
    if (!user || !isOwner) return;
    const { error } = await supabase.from("groups").delete().eq("id", groupId);
    if (error) {
      toast.error("グループを削除できませんでした");
      return;
    }
    toast.success("グループを削除しました");
    void navigate({ to: "/groups" });
  };

  if (loading) return null;

  return (
    <div className="mx-auto flex h-screen w-full max-w-lg flex-col bg-chat">
      <header className="flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label="戻る">
          <Link to="/groups">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <Avatar className="size-9">
          <AvatarImage src={group?.avatar_url ?? undefined} alt={group?.name ?? ""} />
          <AvatarFallback className="bg-brand-gradient text-xs text-primary-foreground">
            {initials(group?.name ?? "?")}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight">{group?.name ?? "..."}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            メンバー {members.length} 人
          </span>
        </span>
        <GroupSettingsDialog
          groupId={groupId}
          group={group}
          members={members}
          isOwner={isOwner}
          onChanged={(g) => {
            if (g) setGroup(g);
            void loadMembers();
          }}
          onLeave={leave}
          onDeleteGroup={deleteGroup}
        />
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-foreground/50">
            最初のメッセージを送ってみましょう
          </p>
        )}
        {messages.map((m, i) => {
          const showDay = isNewDay(messages[i - 1]?.created_at, m.created_at);
          const mine = m.sender_id === user?.id;
          const unsent = !!m.deleted_at;
          const sender = members.find((p) => p.id === m.sender_id);
          const readCount = reads.filter(
            (r) => r.user_id !== m.sender_id && new Date(r.last_read_at) >= new Date(m.created_at),
          ).length;
          const bubble = (
            <div
              className={cn(
                "shadow-soft",
                m.image_url && !unsent
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
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
            </div>
          );
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
                <Avatar className="size-7">
                  <AvatarImage src={sender?.avatar_url ?? undefined} alt={sender?.display_name ?? ""} />
                  <AvatarFallback className="text-[10px]">
                    {initials(sender?.display_name ?? "?")}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn("max-w-[72%]", mine ? "items-end" : "items-start")}>
                {!mine && (
                  <p className="mb-0.5 text-[11px] text-foreground/60">
                    {sender?.display_name ?? "メンバー"}
                    {sender && (
                      <span className="ml-1 font-mono text-[9px] text-foreground/40">
                        ID:{sender.friend_code}
                      </span>
                    )}
                  </p>
                )}
                {mine && !unsent ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="w-full text-left">
                        {bubble}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void unsend(m.id)}>
                        <Undo2 className="mr-2 size-4" />
                        送信を取り消す
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : !mine && sender ? (
                  <ReportDialog
                    targetId={sender.id}
                    targetName={sender.display_name}
                    targetCode={sender.friend_code}
                    context="group"
                    groupId={groupId}
                    messageId={m.id}
                    messageContent={unsent ? null : m.content || "(メディア)"}
                    trigger={
                      <button type="button" className="w-full text-left">
                        {bubble}
                      </button>
                    }
                  />
                ) : (
                  bubble
                )}
              </div>
              <span
                className={cn(
                  "mb-1 flex flex-col text-[10px] text-foreground/50",
                  mine ? "items-end" : "items-start",
                )}
              >
                {mine && !unsent && readCount > 0 && (
                  <span className="text-foreground/60">既読 {readCount}</span>
                )}
                {formatTime(m.created_at)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-border bg-background/95 px-3 py-3 backdrop-blur"
      >
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={pickMedia} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="画像・動画を送信"
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
        <Button type="submit" size="icon" className="rounded-full" aria-label="送信">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function GroupSettingsDialog({
  groupId,
  group,
  members,
  isOwner,
  onChanged,
  onLeave,
  onDeleteGroup,
}: {
  groupId: string;
  group: Group | null;
  members: Profile[];
  isOwner: boolean;
  onChanged: (g?: Group) => void;
  onLeave: () => void;
  onDeleteGroup: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [friends, setFriends] = useState<Profile[]>([]);

  useEffect(() => {
    setName(group?.name ?? "");
  }, [group?.name]);

  useEffect(() => {
    if (!open || !user) return;
    void (async () => {
      const { data: rows } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", user.id);
      const ids = (rows ?? []).map((r) => r.friend_id);
      if (ids.length === 0) {
        setFriends([]);
        return;
      }
      const { data } = await supabase.from("profiles").select("*").in("id", ids);
      setFriends((data ?? []) as Profile[]);
    })();
  }, [open, user]);

  const rename = async () => {
    if (!isOwner) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("groups")
      .update({ name: trimmed })
      .eq("id", groupId)
      .select()
      .single();
    if (error) {
      toast.error("グループ名を変更できませんでした");
      return;
    }
    toast.success("グループ名を変更しました");
    onChanged(data as Group);
  };

  const addMember = async (id: string) => {
    const { error } = await supabase.from("group_members").insert({ group_id: groupId, user_id: id });
    if (error) {
      toast.error("メンバーを追加できませんでした");
      return;
    }
    toast.success("メンバーを追加しました");
    onChanged();
  };

  const removeMember = async (id: string) => {
    if (!isOwner || id === group?.owner_id) return;
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", id);
    if (error) {
      toast.error("メンバーを削除できませんでした");
      return;
    }
    toast.success("メンバーを削除しました");
    onChanged();
  };

  const candidates = friends.filter((f) => !members.some((m) => m.id === f.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="グループ設定">
          <Settings className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>グループ設定</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "作成者はグループ名の変更とメンバーの削除ができます。"
              : "メンバーの追加はどなたでもできます。名前の変更とメンバー削除は作成者のみです。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-semibold">グループ名</p>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} maxLength={40} />
            {isOwner && (
              <Button onClick={rename} disabled={!name.trim() || name.trim() === group?.name}>
                保存
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">メンバー（{members.length}）</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                <Avatar className="size-8">
                  <AvatarImage src={m.avatar_url ?? undefined} alt={m.display_name} />
                  <AvatarFallback className="text-[10px]">{initials(m.display_name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.display_name}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    ID: {m.friend_code}
                  </span>
                </span>
                {group?.owner_id === m.id ? (
                  <span className="text-[10px] text-muted-foreground">作成者</span>
                ) : (
                  isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="メンバーを削除"
                      onClick={() => removeMember(m.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">友だちを追加</p>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">追加できる友だちがいません。</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {candidates.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                  <Avatar className="size-8">
                    <AvatarImage src={f.avatar_url ?? undefined} alt={f.display_name} />
                    <AvatarFallback className="text-[10px]">{initials(f.display_name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm">{f.display_name}</span>
                  <Button variant="ghost" size="sm" onClick={() => addMember(f.id)}>
                    <UserPlus className="mr-1 size-4" />
                    追加
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isOwner ? (
          <Button variant="ghost" className="w-full text-destructive" onClick={onDeleteGroup}>
            <Trash2 className="mr-1 size-4" />
            グループを削除（作成者のみ）
          </Button>
        ) : (
          <Button variant="ghost" className="w-full text-destructive" onClick={onLeave}>
            <LogOut className="mr-1 size-4" />
            グループを退出
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
