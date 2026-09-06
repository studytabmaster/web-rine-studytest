import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Realtime Presence でオンライン状態を共有する。
 * targetId を渡すと、そのユーザーがオンラインかどうかを返す。
 */
export function usePresence(targetId?: string) {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("rine-online", {
      config: { presence: { key: user.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        if (!targetId) return;
        setOnline(Object.keys(channel.presenceState()).includes(targetId));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: new Date().toISOString() });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, targetId]);

  return online;
}
