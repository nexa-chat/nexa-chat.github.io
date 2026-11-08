"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { confirmAction } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { useSettingsStore } from "../settings/settings-store";
import { t } from "@/i18n";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

const noSubscription = (): (() => void) => () => undefined;
const SILENT: readonly number[] = [0, 0, 0, 0, 0];

export interface VoiceInput {
  supported: boolean;
  recording: boolean;
  /** Five bands from 0 to 1, for the wave next to the button. */
  levels: readonly number[];
  start: () => void;
  stop: () => void;
}

/**
 * Dictation through the browser's own speech service. Where the browser has none, voice is
 * simply not offered: there is no simulated fallback.
 */
export function useVoiceInput(text: string, onText: (value: string) => void): VoiceInput {
  const supported = useSyncExternalStore(
    noSubscription,
    () => recognitionConstructor() !== undefined,
    () => false,
  );
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<readonly number[]>(SILENT);

  const recognition = useRef<Recognition | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const latestText = useRef(text);

  useEffect(() => {
    latestText.current = text;
  }, [text]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    recognition.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audio.current?.close();
    audio.current = null;
    setRecording(false);
    setLevels(SILENT);
  }, []);

  useEffect(() => stop, [stop]);

  /** The wave is a bonus. Phones often can't share the microphone, so it may stay flat. */
  const startWave = useCallback(async () => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const media = await navigator.mediaDevices?.getUserMedia({ audio: true }).catch(() => null);
    if (!media) return;
    stream.current = media;

    const context = new AudioContext();
    audio.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    context.createMediaStreamSource(media).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const step = Math.floor(data.length / 5);

    const tick = (): void => {
      analyser.getByteFrequencyData(data);
      setLevels(SILENT.map((_, band) => data.slice(band * step, (band + 1) * step).reduce((sum, value) => sum + value, 0) / step / 255));
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const start = useCallback(() => {
    void (async () => {
      const Constructor = recognitionConstructor();
      if (!Constructor) return;

      const { settings, update } = useSettingsStore.getState();
      if (!settings.voiceConsent) {
        const accepted = await confirmAction({
          title: t("Use voice input?"),
          message: t("Your browser turns speech into text. Depending on the browser, your audio may go to its maker's servers, for example Google in Chrome. It doesn't go through NEXA."),
          confirmLabel: t("Use voice input"),
        });
        if (!accepted) return;
        update({ voiceConsent: true });
      }

      const session = new Constructor();
      session.continuous = true;
      session.interimResults = true;
      session.lang = navigator.language;

      let baseline = latestText.current;
      session.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result) continue;
          if (result.isFinal) baseline = `${baseline} ${result[0].transcript}`.trim();
          else interim += result[0].transcript;
        }
        onText(`${baseline} ${interim}`.trim());
      };
      session.onerror = ({ error }) => {
        if (error === "not-allowed" || error === "service-not-allowed") toast.error(t("The browser blocked the microphone. Allow it for this site, then try again."));
        else if (error !== "aborted" && error !== "no-speech") toast.error(t("Voice input stopped working. Try again, or type your message."));
        stop();
      };
      session.onend = stop;

      recognition.current = session;
      session.start();
      setRecording(true);
      void startWave();
    })();
  }, [onText, startWave, stop]);

  return { supported, recording, levels, start, stop };
}
