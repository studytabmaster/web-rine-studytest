import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, UserCog } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ChatMedia } from "@/components/ChatMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  banUser,
  checkAdmin,
  claimAdmin,
  listModeration,
  listStaff,
  setUserRole,
  unbanUser,
  warnUser,
} from "@/lib/admin.functions";


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
  group_id: string | null;
  evidence_url: string | null;
  evidence_type: string | null;
  message_content: string | null;
};

type Staff = { name: string; code: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  admin: "管理者",
  moderator: "モデレーター",
  user: "一般ユーザー",
};

function AdminPage() {
  const check = useServerFn(checkAdmin);
  const claim = useServerFn(claimAdmin);
  const fetchStaff = useServerFn(listStaff);
  const changeRole = useServerFn(setUserRole);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [detailReport, setDetailReport] = useState<ReportRow | null>(null);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [roleCode, setRoleCode] = useState("");
  const [role, setRole] = useState<"admin" | "moderator" | "user">("moderator");
  const [roleBusy, setRoleBusy] = useState(false);

  const loadStaff = useCallback(async () => {
    try {
      const r = await fetchStaff({});
      setStaff(r.staff as Staff[]);
    } catch {
      setStaff([]);
    }
  }, [fetchStaff]);

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
        if (r.isAdmin) {
          void loadReports();
          void loadStaff();
        }
      })
      .catch(() => setIsAdmin(false));
  }, [check, loadReports, loadStaff]);

  const unlock = async () => {
    setBusy(true);
    try {
      await claim({ data: { password } });
      setIsAdmin(true);
      await loadReports();
      await loadStaff();
      toast.success("管理者として解錠しました");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解錠できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const applyRole = async () => {
    setRoleBusy(true);
    try {
      const r = await changeRole({ data: { friendCode: roleCode.trim(), role } });
      toast.success(`${r.name} さんを${ROLE_LABEL[r.role] ?? r.role}に変更しました`);
      setRoleCode("");
      await loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "変更できませんでした");
    } finally {
      setRoleBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) {
      toast.error("更新できませんでした");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setDetailReport((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
  };

  return (
    <AppShell title="管理者パネル">
      {isAdmin === null && <p className="px-5 py-8 text-sm text-muted-foreground">確認中...</p>}

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
        <div className="space-y-6 px-5 py-4">
          <section className="rounded-3xl bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <UserCog className="size-5 text-primary" />
              <h2 className="text-base font-bold">管理者に登録</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              相手の8桁の識別IDを入力して、権限を変更できます。
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="role-code">識別ID</Label>
                <Input
                  id="role-code"
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value.toUpperCase())}
                  placeholder="ABCD2345"
                  className="font-mono tracking-widest"
                  maxLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label>権限</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">管理者</SelectItem>
                    <SelectItem value="moderator">モデレーター</SelectItem>
                    <SelectItem value="user">一般ユーザー（権限を外す）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="brand"
                size="pill"
                className="w-full"
                disabled={roleBusy || roleCode.trim().length < 4}
                onClick={applyRole}
              >
                {roleBusy ? "変更中..." : "権限を変更する"}
              </Button>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">現在のスタッフ</p>
              {staff.length === 0 ? (
                <p className="text-xs text-muted-foreground">スタッフはまだいません</p>
              ) : (
                <ul className="space-y-1.5">
                  {staff.map((s) => (
                    <li
                      key={`${s.code}-${s.role}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">
                        {s.name}
                        <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                          {s.code}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                        {ROLE_LABEL[s.role] ?? s.role}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold">通報一覧</h2>
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
                {r.detail && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.detail}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {r.context === "group" ? "グループ" : "個別トーク"} ·{" "}
                  {new Date(r.created_at).toLocaleString("ja-JP")}
                  {r.evidence_url ? " · 添付あり" : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
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
                  <Button size="sm" variant="ghost" onClick={() => setDetailReport(r)}>
                    詳細を見る
                  </Button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      <Dialog open={!!detailReport} onOpenChange={(o) => !o && setDetailReport(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>通報の詳細</DialogTitle>
          </DialogHeader>
          {detailReport && (
            <div className="space-y-3 text-sm">
              <Row label="被通報者">
                {names[detailReport.reported_id] ?? detailReport.reported_id}
              </Row>
              <Row label="識別ID">
                <span className="font-mono tracking-widest">
                  {detailReport.reported_code ?? "—"}
                </span>
              </Row>
              <Row label="通報者">
                {names[detailReport.reporter_id] ?? detailReport.reporter_id}
              </Row>
              <Row label="理由">{detailReport.reason}</Row>
              <Row label="詳細">{detailReport.detail || "（なし）"}</Row>
              <Row label="場所">
                {detailReport.context === "group" ? "グループトーク" : "個別トーク"}
              </Row>
              <Row label="状態">{detailReport.status}</Row>
              <Row label="日時">
                {new Date(detailReport.created_at).toLocaleString("ja-JP")}
              </Row>
              {detailReport.message_content && (
                <Row label="対象メッセージ">
                  <span className="whitespace-pre-wrap">{detailReport.message_content}</span>
                </Row>
              )}
              {detailReport.evidence_url && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">添付された証拠</p>
                  <ChatMedia
                    path={detailReport.evidence_url}
                    mediaType={detailReport.evidence_type}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {["open", "reviewing", "closed"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={detailReport.status === s ? "brand" : "outline"}
                    onClick={() => setStatus(detailReport.id, s)}
                  >
                    {s === "open" ? "未対応" : s === "reviewing" ? "確認中" : "対応済み"}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}
