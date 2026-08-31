import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "RINE にログイン｜無料トーク・通話アプリ" },
      {
        name: "description",
        content:
          "RINE のアカウントを作成またはログインして、友だちとのトークと無料の音声・ビデオ通話をブラウザで始めましょう。",
      },
      { property: "og:title", content: "RINE にログイン" },
      {
        property: "og:description",
        content: "ブラウザだけで使えるトーク・通話アプリ RINE にログイン。",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("アカウントを作成しました！そのまま利用できます");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "うまくいきませんでした");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google ログインに失敗しました");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-gradient px-6 py-12">
      <div className="w-full max-w-sm rounded-3xl bg-card p-8 shadow-soft">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-gradient text-3xl font-black text-primary-foreground">
            R
          </div>
          <h1 className="text-3xl font-black tracking-tight">RINE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            友だちとトークも通話も、ブラウザだけで。
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={
              "rounded-full py-2 text-sm font-semibold transition-colors " +
              (mode === "login" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground")
            }
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={
              "rounded-full py-2 text-sm font-semibold transition-colors " +
              (mode === "signup" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground")
            }
          >
            新規登録（無料）
          </button>
        </div>

        {mode === "signup" && (
          <div className="mb-5 rounded-2xl bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">アカウントの作り方（30秒）</p>
            <ol className="list-inside list-decimal space-y-0.5">
              <li>表示名（あとで変更できます）を入力</li>
              <li>メールアドレスとパスワード（6文字以上）を入力</li>
              <li>「新規登録する」を押すだけ。メール確認は不要です</li>
            </ol>
            <p className="mt-2">
              登録すると、なりすまし防止用の8桁の識別IDが自動で割り当てられます。
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">表示名</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="やまだ たろう"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上"
            />
          </div>
          <Button type="submit" variant="brand" size="pill" className="w-full" disabled={busy}>
            {busy ? "処理中..." : mode === "login" ? "ログイン" : "新規登録する"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          または
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" size="pill" className="w-full" onClick={google}>
          Google で{mode === "signup" ? "登録" : "ログイン"}（メール不要）
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "login"
            ? "アカウントをお持ちでない方は「新規登録（無料）」へ"
            : "すでにアカウントをお持ちの方はログインへ"}
        </button>
      </div>
    </div>
  );
}
