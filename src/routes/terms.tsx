import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "利用規約｜RINE" },
      { name: "description", content: "RINE の利用規約。禁止事項、アカウント、通報・ブロック、免責事項について定めています。" },
      { property: "og:title", content: "利用規約｜RINE" },
      { property: "og:description", content: "RINE をご利用いただく際のルールと注意事項。" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-lg bg-background px-6 py-10">
      <h1 className="text-2xl font-bold">利用規約</h1>
      <p className="mt-2 text-xs text-muted-foreground">最終更新日: 2026年9月1日</p>

      <section className="mt-6 space-y-5 text-sm leading-relaxed">
        <div>
          <h2 className="font-bold">1. 適用</h2>
          <p>本規約は、RINE（以下「本サービス」）の利用条件を定めるものです。利用者は本規約に同意した上で本サービスを利用します。</p>
        </div>
        <div>
          <h2 className="font-bold">2. アカウント</h2>
          <p>アカウント作成時に8桁の識別IDが自動で割り当てられます。識別IDは変更できず、なりすまし防止のために使用されます。パスワードの管理は利用者の責任です。</p>
        </div>
        <div>
          <h2 className="font-bold">3. 禁止事項</h2>
          <ul className="list-inside list-disc">
            <li>法令または公序良俗に違反する行為</li>
            <li>他の利用者へのいやがらせ、脅迫、差別的表現</li>
            <li>なりすまし、詐欺、スパム、宣伝目的の利用</li>
            <li>権利者の許可のない画像・動画の送信</li>
            <li>本サービスの運営を妨害する行為</li>
          </ul>
        </div>
        <div>
          <h2 className="font-bold">4. 通報・ブロックと措置</h2>
          <p>利用者は他の利用者をブロックし、運営に通報できます。運営は通報内容（添付された画像・動画を含む）を確認し、必要に応じて投稿の削除やアカウントの利用停止を行うことがあります。</p>
        </div>
        <div>
          <h2 className="font-bold">5. 免責</h2>
          <p>本サービスは現状有姿で提供されます。通信環境や外部サービスの障害により、トークや通話が利用できない場合があります。利用者間のやり取りにより生じた損害について、運営は責任を負いません。</p>
        </div>
        <div>
          <h2 className="font-bold">6. 規約の変更</h2>
          <p>運営は本規約を変更することがあります。変更後に本サービスを利用した場合、変更に同意したものとみなします。</p>
        </div>
      </section>

      <div className="mt-8 flex gap-4 text-sm">
        <Link to="/privacy" className="text-primary underline">
          プライバシーポリシー
        </Link>
        <Link to="/" className="text-muted-foreground underline">
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
}
