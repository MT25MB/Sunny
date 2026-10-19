import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";

/**
 * Press-and-hold voice input.
 *
 * Recording is deliberately push-to-talk: the microphone is opened on press
 * and closed on release, so audio exists only while the user is holding the
 * button. Nothing is written to disk — the samples go straight to the main
 * process for local Whisper transcription and are discarded afterwards.
 */
interface MicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type Phase = "idle" | "recording" | "transcribing" | "unavailable";

/** Whisper wants 16 kHz mono. Recording happens at whatever rate we get. */
const TARGET_SAMPLE_RATE = 16_000;
const MAX_SECONDS = 30;

export function MicButton({ onTranscript, disabled }: MicButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Ask the main process whether local STT is usable at all. If the model
  // cannot load we say so rather than offering a button that always fails.
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      ?.getSpeechStatus?.()
      .then((status) => {
        if (cancelled || !status) return;
        if (!status.available) {
          setPhase("unavailable");
          setError("Voice input is unavailable. Please type your question instead.");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const release = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => release, [release]);

  const stopAndTranscribe = useCallback(async () => {
    release();
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;

    setPhase("transcribing");

    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    try {
      // Decode and resample in the renderer with Web Audio — the main process
      // should not need an audio codec, and the model wants raw PCM anyway.
      const pcm = await decodeTo16kMono(blob);
      if (!pcm) {
        setPhase("idle");
        setError("That recording was too short to understand.");
        return;
      }

      const result = await window.electronAPI?.transcribe?.(pcm);
      if (!result) {
        setPhase("idle");
        setError("Voice input is unavailable. Please type your question instead.");
        return;
      }
      if (result.silent || !result.text.trim()) {
        setPhase("idle");
        setError("Sunny didn't hear anything.");
        return;
      }
      setError("");
      setPhase("idle");
      onTranscript(result.text);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Voice input failed.");
    }
  }, [release, onTranscript]);

  const start = useCallback(async () => {
    // Guard recording too: Space/Enter auto-repeat fires onKeyDown on
    // every tick while held, and between the first keydown's setPhase
    // and the re-render this closure still sees phase === "idle".
    // Without this each repeat spawns a second getUserMedia +
    // MediaRecorder and orphans the first mic track.
    if (disabled || phase === "transcribing" || phase === "unavailable" || phase === "recording") return;
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unavailable");
      setError("This computer does not support voice input.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void stopAndTranscribe();
      };
      recorder.start();
      recorderRef.current = recorder;

      setPhase("recording");
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          // Hard cap so a forgotten press cannot record indefinitely.
          if (next >= MAX_SECONDS && recorderRef.current) {
            recorderRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch {
      setPhase("idle");
      setError("Sunny could not use the microphone. Check your privacy settings.");
    }
  }, [disabled, phase, stopAndTranscribe]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void start();
  };

  const handlePointerUp = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  };

  if (phase === "unavailable") {
    return null;
  }

  const busy = phase === "transcribing";

  return (
    <div className="mic-wrapper">
      <button
        type="button"
        className={`mic-btn ${phase === "recording" ? "recording" : ""} ${busy ? "busy" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") void start();
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") handlePointerUp();
        }}
        disabled={disabled || busy}
        aria-label={phase === "recording" ? "Release to send" : "Hold to speak"}
        title="Hold to speak"
      >
        {busy ? (
          <Loader2 size={20} className="mic-spin" aria-hidden="true" />
        ) : phase === "recording" ? (
          <MicOff size={20} aria-hidden="true" />
        ) : (
          <Mic size={20} aria-hidden="true" />
        )}
      </button>
      {phase === "recording" && (
        <span className="mic-timer" role="status" aria-live="polite">
          Recording {seconds}s — release to send
        </span>
      )}
      {busy && (
        <span className="mic-timer" role="status" aria-live="polite">
          Listening…
        </span>
      )}
      {error && !busy && phase !== "recording" && (
        <span className="mic-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Decodes a recorded blob to 16 kHz mono Float32 PCM, which is what Whisper
 * expects. Returns null when the audio is too short to be meaningful.
 */
async function decodeTo16kMono(blob: Blob): Promise<Float32Array | null> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const channels = decoded.numberOfChannels;
    const frameCount = Math.floor((decoded.duration * TARGET_SAMPLE_RATE));
    if (frameCount < TARGET_SAMPLE_RATE * 0.3) return null;

    const output = new Float32Array(frameCount);
    for (let channel = 0; channel < channels; channel += 1) {
      const source = decoded.getChannelData(channel);
      // Linear resample; adequate for speech at this ratio.
      const ratio = decoded.sampleRate / TARGET_SAMPLE_RATE;
      for (let i = 0; i < frameCount; i += 1) {
        const position = i * ratio;
        const index = Math.floor(position);
        const next = Math.min(index + 1, source.length - 1);
        const weight = position - index;
        output[i] += (source[index] * (1 - weight) + source[next] * weight) / channels;
      }
    }
    return output;
  } finally {
    await audioContext.close();
  }
}
