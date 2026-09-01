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
