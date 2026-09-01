import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { checkAdmin, claimAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "管理者パネル｜RINE" },
      { name: "description", content: "RINE の通報を確認し、対応ステータスを管理する管理者専用ページ。" },
      { property: "og:title", content: "管理者パネル｜RINE" },
      { property: "og:description", content: "通報の確認と対応ステータス管理。" },
    ],
  }),
  component: AdminPage,
});

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reported_code: string | null;
  reason: string;
  detail: string;
  context: string;
  status: string;
  created_at: string;
};

function AdminPage() {
  const check = useServerFn(checkAdmin);
  const claim = useServerFn(claimAdmin);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as ReportRow[];
    setReports(rows);
    const ids = Array.from(new Set(rows.flatMap((r) => [r.reporter_id, r.reported_id])));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,friend_code")
        .in("id", ids);
      const map: Record<string, string> = {};
      for (const p of profs ?? []) map[p.id] = `${p.display_name}（${p.friend_code}）`;
      setNames(map);
    }
  }, []);

  useEffect(() => {
    void check({})
      .then((r) => {
        setIsAdmin(r.isAdmin);
        if (r.isAdmin) void loadReports();
      })
      .catch(() => setIsAdmin(false));
  }, [check, loadReports]);

  const unlock = async () => {
    setBusy(true);
    try {
      await claim({ data: { password } });
      setIsAdmin(true);
      await loadReports();
      toast.success("管理者として解錠しました");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解錠できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) {
      toast.error("更新できませんでした");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  return (
    <AppShell title="管理者パネル">
      {isAdmin === null && (
        <p className="px-5 py-8 text-sm text-muted-foreground">確認中...</p>
      )}

      {isAdmin === false && (
        <div className="mx-5 mt-8 rounded-3xl bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-base font-bold">管理者パスワード</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            管理者パスワードを入力すると、このアカウントに管理者権限が付与されます。
          </p>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
          />
          <Button
            variant="brand"
            size="pill"
            className="mt-4 w-full"
            disabled={busy || !password}
            onClick={unlock}
          >
            {busy ? "確認中..." : "解錠する"}
          </Button>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-3 px-5 py-4">
          {reports.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">通報はまだありません</p>
          )}
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    被通報: {names[r.reported_id] ?? r.reported_code ?? r.reported_id}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    通報者: {names[r.reporter_id] ?? r.reporter_id}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {r.status}
                </span>
              </div>
              <p className="mt-2 text-sm">理由: {r.reason}</p>
              {r.detail && <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {r.context === "group" ? "グループ" : "個別トーク"} ·{" "}
                {new Date(r.created_at).toLocaleString("ja-JP")}
              </p>
              <div className="mt-3 flex gap-2">
                {["open", "reviewing", "closed"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={r.status === s ? "brand" : "outline"}
                    onClick={() => setStatus(r.id, s)}
                  >
                    {s === "open" ? "未対応" : s === "reviewing" ? "確認中" : "対応済み"}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
