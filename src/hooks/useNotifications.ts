import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission as NotificationPermissionState;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission as NotificationPermissionState);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("このブラウザは通知をサポートしていません");
      return false;
    }

    if (Notification.permission === "granted") {
      setPermission("granted");
      return true;
    }

    if (Notification.permission === "denied") {
      toast.error("ブラウザの設定から通知を許可してください");
      setPermission("denied");
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermissionState);
    if (result === "granted") {
      toast.success("通知が許可されました");
      return true;
    }
    toast.error("通知が許可されませんでした");
    return false;
  }, []);

  const sendNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (typeof window === "undefined") return;
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (!document.hidden) return;

      const notification = new Notification(title, {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        ...options,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    },
    [],
  );

  return { permission, requestPermission, sendNotification };
}
