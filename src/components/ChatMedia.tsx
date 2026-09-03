import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = { path: string; mediaType?: string | null };

/** チャットに添付された画像・動画を署名付きURLで表示する */
export function ChatMedia({ path, mediaType }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const isVideo = mediaType === "video";

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      setFailed(false);
      setUrl(null);

      const { data, error } = await supabase.storage
        .from("chat-images")
        .createSignedUrl(path, 60 * 60 * 24);

      if (cancelled) return;

      if (data?.signedUrl) {
        setUrl(data.signedUrl);
        return;
      }

      // 署名付きURLが取れない場合は直接ダウンロードして表示を試みる
      console.warn("signed url failed", error?.message);
      const { data: blob } = await supabase.storage.from("chat-images").download(path);
      if (cancelled) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } else {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, reload]);

  if (failed) {
    return (
      <button
        type="button"
        onClick={() => setReload((n) => n + 1)}
        className="flex h-32 w-48 flex-col items-center justify-center gap-1 rounded-xl bg-foreground/10 text-xs text-foreground/60"
      >
        <RefreshCw className="size-4" />
        読み込めませんでした（再試行）
      </button>
    );
  }

  if (!url) {
    return <div className="h-40 w-40 animate-pulse rounded-xl bg-foreground/10" />;
  }

  const download = async () => {
    setBusy(true);
    try {
      const { data: blob, error } = await supabase.storage.from("chat-images").download(path);
      if (error || !blob) throw error ?? new Error("download failed");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = path.split("/").pop() || (isVideo ? "video.mp4" : "image.jpg");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      toast.success("ダウンロードしました");
    } catch {
      toast.error("ダウンロードできませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-block">
      {isVideo ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-72 w-auto max-w-full rounded-xl bg-black"
        />
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt="送信されたメディア"
            loading="lazy"
            onError={() => setFailed(true)}
            className="max-h-64 w-auto max-w-full rounded-xl object-cover"
          />
        </a>
      )}
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-label="ダウンロード"
        title="ダウンロード"
        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-foreground/70 px-3 py-1.5 text-xs font-medium text-background backdrop-blur transition hover:bg-foreground/85 disabled:opacity-60"
      >
        <Download className="size-3.5" />
        {busy ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
