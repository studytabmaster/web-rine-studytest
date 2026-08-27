import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.storage.from("chat-images").createSignedUrl(path, 3600);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return <div className="h-40 w-40 animate-pulse rounded-xl bg-foreground/10" />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="送信された画像"
        loading="lazy"
        className="max-h-64 w-auto max-w-full rounded-xl object-cover"
      />
    </a>
  );
}
