import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCall } from "@/components/CallProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDuration, initials } from "@/lib/rine";
import { cn } from "@/lib/utils";

export function CallOverlay() {
  const {
    status,
    peer,
    video,
    muted,
    cameraOff,
    seconds,
    acceptCall,
    hangUp,
    toggleMute,
    toggleCamera,
    localStream,
    remoteStream,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, status]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, status]);

  if (status === "idle" || !peer) return null;

  const label =
    status === "calling"
      ? "呼び出し中…"
      : status === "incoming"
        ? `${video ? "ビデオ通話" : "音声通話"}の着信`
        : status === "connecting"
          ? "接続中…"
          : formatDuration(seconds);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[var(--brand-dark)] px-6 py-12 text-primary-foreground">
      {video && (status === "active" || status === "connecting") && (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute right-4 top-4 z-10 h-40 w-28 rounded-2xl object-cover shadow-soft"
          />
        </>
      )}
      {!video && <audio ref={remoteAudioRef} autoPlay />}

      <div className="relative z-10 mt-10 flex flex-col items-center gap-4 text-center">
        <Avatar className="size-28 border-4 border-white/20">
          <AvatarImage src={peer.avatar_url ?? undefined} alt={peer.display_name} />
          <AvatarFallback className="bg-brand-gradient text-3xl text-primary-foreground">
            {initials(peer.display_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-2xl font-semibold">{peer.display_name}</p>
          <p className="mt-1 text-sm opacity-70">{label}</p>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-5">
        {status === "incoming" ? (
          <>
            <Button variant="call" size="call" onClick={() => hangUp(true)} aria-label="拒否">
              <PhoneOff className="size-7" />
            </Button>
            <Button variant="answer" size="call" onClick={acceptCall} aria-label="応答">
              <Phone className="size-7" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="callSoft" size="call" onClick={toggleMute} aria-label="ミュート">
              {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </Button>
            {video && (
              <Button variant="callSoft" size="call" onClick={toggleCamera} aria-label="カメラ">
                {cameraOff ? <VideoOff className="size-6" /> : <Video className="size-6" />}
              </Button>
            )}
            <Button
              variant="call"
              size="call"
              onClick={() => hangUp(true)}
              aria-label="通話を終了"
              className={cn(status === "calling" && "animate-pulse")}
            >
              <PhoneOff className="size-7" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
