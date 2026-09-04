import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

type BanRow = { id: string; reason: string; banned_until: string | null };
type WarnRow = { id: string; message: string; created_at: string };

/** 自分に対する利用停止・未確認の警告を表示する */
export function ModerationNotice() {
  const { user } = useAuth();
  const [ban, setBan] = useState<BanRow | null>(null);
  const [warnings, setWarnings] = useState<WarnRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: bans }, { data: warns }] = await Promise.all([
      supabase.from("user_bans").select("id,reason,banned_until").eq("user_id", user.id),
      supabase
        .from("user_warnings")
        .select("id,message,created_at")
        .eq("user_id", user.id)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false }),
    ]);
    const active = (bans ?? []).find(
      (b) => !b.banned_until || new Date(b.banned_until).getTime() > Date.now(),
    );
    setBan((active as BanRow) ?? null);
    setWarnings((warns ?? []) as WarnRow[]);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = async (id: string) => {
    await supabase
      .from("user_warnings")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  };

  if (!ban && warnings.length === 0) return null;

  return (
    <div className="space-y-2 px-5 pt-3">
      {ban && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-destructive">
            <Ban className="size-4" /> このアカウントは利用停止中です
          </p>
          {ban.reason && <p className="mt-1 text-xs text-destructive/90">理由: {ban.reason}</p>}
          <p className="mt-1 text-xs text-destructive/90">
            {ban.banned_until
              ? `解除予定: ${new Date(ban.banned_until).toLocaleString("ja-JP")}`
              : "期限: 無期限"}
          </p>
          <p className="mt-1 text-[11px] text-destructive/80">
            停止中はメッセージを送信できません。
          </p>
        </div>
      )}
      {warnings.map((w) => (
        <div key={w.id} className="rounded-2xl border border-amber-400/50 bg-amber-400/10 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4" /> 管理者からの警告
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs">{w.message}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {new Date(w.created_at).toLocaleString("ja-JP")}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void acknowledge(w.id)}>
            確認しました
          </Button>
        </div>
      ))}
    </div>
  );
}
