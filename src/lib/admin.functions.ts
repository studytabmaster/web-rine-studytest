import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** 管理者パネルの解錠パスワード（サーバー側のみで検証） */
function adminPassword() {
  return process.env["ADMIN_PANEL_PASSWORD"] || "haya8282";
}

export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return { isAdmin: (data ?? []).some((r) => r.role === "admin" || r.role === "moderator") };
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ password: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.password !== adminPassword()) {
      throw new Error("パスワードが違います");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

/** 管理者が他ユーザーの権限を変更する（識別IDで指定） */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        friendCode: z.string().min(1),
        role: z.enum(["admin", "moderator", "user"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("管理者のみ操作できます");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .ilike("friend_code", data.friendCode.trim())
      .maybeSingle();
    if (!target) throw new Error("その識別IDのユーザーが見つかりません");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", target.id);
    if (data.role !== "user") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: target.id, role: data.role });
      if (error) throw new Error(error.message);
    }
    return { name: target.display_name, role: data.role };
  });

/** 現在の管理者・モデレーター一覧 */
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { staff: [] as { name: string; code: string; role: string }[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (!ids.length) return { staff: [] };
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name,friend_code")
      .in("id", ids);
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    return {
      staff: (roles ?? []).map((r) => ({
        name: map.get(r.user_id)?.display_name ?? r.user_id,
        code: map.get(r.user_id)?.friend_code ?? "",
        role: r.role as string,
      })),
    };
  });

/** 対象ユーザーを識別IDで解決する（管理者専用ヘルパー） */
async function resolveTarget(friendCode: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,display_name,friend_code")
    .ilike("friend_code", friendCode.trim())
    .maybeSingle();
  if (!data) throw new Error("その識別IDのユーザーが見つかりません");
  return { target: data, supabaseAdmin };
}

async function assertStaff(context: { supabase: any; userId: string }, adminOnly: boolean) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (isAdmin) return;
  if (adminOnly) throw new Error("管理者のみ操作できます");
  const { data: isMod } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "moderator",
  });
  if (!isMod) throw new Error("権限がありません");
}

/** 利用停止（BAN）を設定する。hours=0 で無期限 */
export const banUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        friendCode: z.string().min(1),
        hours: z.number().min(0).max(24 * 365),
        reason: z.string().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context, true);
    const { target, supabaseAdmin } = await resolveTarget(data.friendCode);
    const until =
      data.hours > 0 ? new Date(Date.now() + data.hours * 3600_000).toISOString() : null;
    await supabaseAdmin.from("user_bans").delete().eq("user_id", target.id);
    const { error } = await supabaseAdmin.from("user_bans").insert({
      user_id: target.id,
      banned_until: until,
      reason: data.reason,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { name: target.display_name, until };
  });

/** 利用停止を解除する */
export const unbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_bans").delete().eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 警告を送る（管理者・モデレーター） */
export const warnUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ friendCode: z.string().min(1), message: z.string().min(1).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context, false);
    const { target, supabaseAdmin } = await resolveTarget(data.friendCode);
    const { error } = await supabaseAdmin
      .from("user_warnings")
      .insert({ user_id: target.id, message: data.message, created_by: context.userId });
    if (error) throw new Error(error.message);
    return { name: target.display_name };
  });

/** 現在の停止中ユーザーと最近の警告 */
export const listModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertStaff(context, false);
    } catch {
      return { bans: [], warnings: [] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: bans }, { data: warnings }] = await Promise.all([
      supabaseAdmin
        .from("user_bans")
        .select("id,user_id,reason,banned_until,created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("user_warnings")
        .select("id,user_id,message,acknowledged_at,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const ids = Array.from(
      new Set([...(bans ?? []).map((b) => b.user_id), ...(warnings ?? []).map((w) => w.user_id)]),
    );
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,display_name,friend_code").in("id", ids)
      : { data: [] as { id: string; display_name: string; friend_code: string }[] };
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    const label = (id: string) =>
      map.get(id) ? `${map.get(id)!.display_name}（${map.get(id)!.friend_code}）` : id;
    return {
      bans: (bans ?? []).map((b) => ({
        id: b.id,
        userId: b.user_id,
        who: label(b.user_id),
        reason: b.reason as string,
        until: b.banned_until as string | null,
        active: !b.banned_until || new Date(b.banned_until).getTime() > Date.now(),
      })),
      warnings: (warnings ?? []).map((w) => ({
        id: w.id,
        who: label(w.user_id),
        message: w.message as string,
        createdAt: w.created_at as string,
        acknowledged: !!w.acknowledged_at,
      })),
    };
  });
