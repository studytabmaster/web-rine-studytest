import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "プライバシーポリシー｜RINE" },
      { name: "description", content: "RINE が取得する情報、利用目的、保存期間、削除方法についてのプライバシーポリシー。" },
      { property: "og:title", content: "プライバシーポリシー｜RINE" },
      { property: "og:description", content: "RINE の個人情報の取り扱いについて。" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-lg bg-background px-6 py-10">
      <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
      <p className="mt-2 text-xs text-muted-foreground">最終更新日: 2026年9月1日</p>

      <section className="mt-6 space-y-5 text-sm leading-relaxed">
        <div>
          <h2 className="font-bold">1. 取得する情報</h2>
          <ul className="list-inside list-disc">
            <li>メールアドレス、パスワード（暗号化して保存）、Google ログイン時の基本プロフィール</li>
            <li>表示名、ひとこと、アイコン、自動割り当ての識別ID</li>
            <li>トークの本文、添付した画像・動画、既読状態</li>
            <li>友だち・グループの関係、ブロックおよび通報の記録</li>
          </ul>
        </div>
        <div>
          <h2 className="font-bold">2. 利用目的</h2>
          <p>トーク・通話機能の提供、既読や未読の表示、なりすましや迷惑行為の防止、通報対応のために利用します。広告目的での第三者提供は行いません。</p>
        </div>
        <div>
          <h2 className="font-bold">3. 通話について</h2>
          <p>音声・ビデオ通話は端末同士で直接接続され、通話の音声や映像は保存されません。接続に必要な一時的な情報のみを経由します。</p>
        </div>
        <div>
          <h2 className="font-bold">4. 通報時の情報の取り扱い</h2>
          <p>通報された内容と添付ファイルは、対応のために管理者のみが閲覧します。通報したことが相手に通知されることはありません。</p>
        </div>
        <div>
          <h2 className="font-bold">5. 保存と削除</h2>
          <p>送信したメッセージは自分で送信取り消しができます。アカウントおよびデータの削除をご希望の場合は、アプリ内の通報・お問い合わせ導線からご連絡ください。</p>
        </div>
        <div>
          <h2 className="font-bold">6. 安全管理</h2>
          <p>データは行レベルのアクセス制御により、本人と関係者のみが参照できるよう保護しています。</p>
        </div>
      </section>

      <div className="mt-8 flex gap-4 text-sm">
        <Link to="/terms" className="text-primary underline">
          利用規約
        </Link>
        <Link to="/" className="text-muted-foreground underline">
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
}
