import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import type { CallSignal, Profile } from "@/lib/rine";
import { CallOverlay } from "@/components/CallOverlay";
import { toast } from "sonner";

export type CallStatus = "idle" | "calling" | "ringing" | "incoming" | "connecting" | "active";

type CallState = {
  status: CallStatus;
  peer: Profile | null;
  video: boolean;
  muted: boolean;
  cameraOff: boolean;
  seconds: number;
};

type CallContextValue = CallState & {
  startCall: (peer: Profile, video: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  hangUp: (notify?: boolean) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
};

const CallContext = createContext<CallContextValue | null>(null);

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { sendNotification } = useNotifications();
  const [status, setStatus] = useState<CallStatus>("idle");
  const [peer, setPeer] = useState<Profile | null>(null);
  const [video, setVideo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const noAnswerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 通話履歴の記録用（発信者のみ保存）
  const isCallerRef = useRef(false);
  const answeredRef = useRef(false);
  const outcomeRef = useRef<"missed" | "rejected" | null>(null);
  const secondsRef = useRef(0);
  const videoRef = useRef(false);

  const clearNoAnswerTimer = useCallback(() => {
    if (noAnswerTimer.current) {
      clearTimeout(noAnswerTimer.current);
      noAnswerTimer.current = null;
    }
  }, []);

  const sendSignal = useCallback(
    async (kind: CallSignal["kind"], payload: unknown, isVideo = false) => {
      const to = peerIdRef.current;
      if (!user || !to) return;
      await supabase.from("call_signals").insert({
        from_user: user.id,
        to_user: to,
        kind,
        payload: payload as never,
        video: isVideo,
      });
    },
    [user],
  );

  const cleanup = useCallback(() => {
    if (noAnswerTimer.current) {
      clearTimeout(noAnswerTimer.current);
      noAnswerTimer.current = null;
    }
    // 発信者のみ通話履歴を保存（着信側は保存しない＝二重登録防止）
    const to = peerIdRef.current;
    if (user && isCallerRef.current && to) {
      const status = outcomeRef.current ?? (answeredRef.current ? "answered" : "cancelled");
      void supabase.from("call_logs").insert({
        caller_id: user.id,
        callee_id: to,
        video: videoRef.current,
        status,
        duration_seconds: secondsRef.current,
      });
    }
    isCallerRef.current = false;
    answeredRef.current = false;
    outcomeRef.current = null;
    secondsRef.current = 0;
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
    peerIdRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("idle");
    setPeer(null);
    setSeconds(0);
    setMuted(false);
    setCameraOff(false);
  }, [user]);

  const hangUp = useCallback(
    (notify = true) => {
      if (notify) void sendSignal("end", null);
      cleanup();
    },
    [sendSignal, cleanup],
  );

  const createPeerConnection = useCallback(async (wantVideo: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo ? { facingMode: "user" } : false,
    });
    localRef.current = stream;
    setLocalStream(stream);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
      setRemoteStream(new MediaStream(remote.getTracks()));
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignalRef.current("ice", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("active");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        toast.error("通話が切断されました");
        cleanupRef.current();
      }
    };
    pcRef.current = pc;
    return pc;
  }, []);

  // stable refs to avoid stale closures inside RTC callbacks
  const sendSignalRef = useRef(sendSignal);
  const cleanupRef = useRef(cleanup);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
    cleanupRef.current = cleanup;
  }, [sendSignal, cleanup]);

  const startCall = useCallback(
    async (target: Profile, wantVideo: boolean) => {
      if (status !== "idle") return;
      try {
        peerIdRef.current = target.id;
        setPeer(target);
        setVideo(wantVideo);
        setStatus("calling");
        const pc = await createPeerConnection(wantVideo);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignalRef.current("offer", offer, wantVideo);
      } catch {
        toast.error("カメラ・マイクを利用できませんでした");
        cleanup();
      }
    },
    [status, createPeerConnection, cleanup],
  );

  const acceptCall = useCallback(async () => {
    const offer = pendingOffer.current;
    if (!offer) return;
    clearNoAnswerTimer();
    try {
      setStatus("connecting");
      const pc = await createPeerConnection(video);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const c of pendingIce.current) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingIce.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignalRef.current("answer", answer);
    } catch {
      toast.error("カメラ・マイクを利用できませんでした");
      hangUp();
    }
  }, [video, createPeerConnection, hangUp, clearNoAnswerTimer]);

  // realtime signaling
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`call-signals-${user.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: `to_user=eq.${user.id}`,
        },
        async (payload) => {
          const signal = payload.new as CallSignal;
          const pc = pcRef.current;

          if (signal.kind === "offer") {
            if (statusRef.current !== "idle") {
              peerIdRef.current = signal.from_user;
              await sendSignalRef.current("reject", null);
              peerIdRef.current = null;
              return;
            }
            peerIdRef.current = signal.from_user;
            pendingOffer.current = signal.payload as RTCSessionDescriptionInit;
            setVideo(signal.video);
            setStatus("incoming");
            const { data } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", signal.from_user)
              .maybeSingle();
            const caller = (data as Profile) ?? null;
            setPeer(caller);
            sendNotification(caller?.display_name || "着信", {
              body: signal.video ? "ビデオ通話の着信があります" : "音声通話の着信があります",
              tag: `call-${signal.from_user}`,
              requireInteraction: true,
            });
            // 相手（発信者）に「呼び出し中」を即時通知
            void sendSignalRef.current("ringing", null, signal.video);
            // 一定時間応答がなければ不在として双方に反映
            if (noAnswerTimer.current) clearTimeout(noAnswerTimer.current);
            noAnswerTimer.current = setTimeout(() => {
              if (statusRef.current !== "incoming") return;
              void sendSignalRef.current("unanswered", null);
              toast("不在着信がありました");
              cleanupRef.current();
            }, 30000);
            return;
          }

          if (signal.kind === "ringing") {
            if (statusRef.current === "calling") setStatus("ringing");
            return;
          }

          if (signal.kind === "unanswered") {
            if (statusRef.current !== "idle") {
              toast("相手が応答しませんでした（不在）");
              cleanupRef.current();
            }
            return;
          }

          if (signal.kind === "answer" && pc) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit),
            );
            for (const c of pendingIce.current) await pc.addIceCandidate(new RTCIceCandidate(c));
            pendingIce.current = [];
            setStatus("connecting");
            return;
          }

          if (signal.kind === "ice") {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (pc?.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            } else {
              pendingIce.current.push(candidate);
            }
            return;
          }

          if (signal.kind === "end" || signal.kind === "reject") {
            if (statusRef.current !== "idle") {
              toast(signal.kind === "reject" ? "相手は通話中です" : "通話が終了しました");
              cleanupRef.current();
            }
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // 発信側: 応答がないまま一定時間経過したら不在として終了
  useEffect(() => {
    if (status !== "calling" && status !== "ringing") return;
    const id = setTimeout(() => {
      void sendSignalRef.current("end", null);
      toast("応答がありませんでした（不在）");
      cleanupRef.current();
    }, 35000);
    return () => clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (status !== "active") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const toggleMute = useCallback(() => {
    const stream = localRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const stream = localRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  }, [cameraOff]);

  useEffect(() => () => cleanupRef.current(), []);

  return (
    <CallContext.Provider
      value={{
        status,
        peer,
        video,
        muted,
        cameraOff,
        seconds,
        startCall,
        acceptCall,
        hangUp,
        toggleMute,
        toggleCamera,
        localStream,
        remoteStream,
      }}
    >
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
