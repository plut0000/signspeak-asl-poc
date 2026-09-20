"use client";

import { speakEnglish, speechSupported, stopSpeaking } from "@/lib/tts";
import { useCallback, useEffect, useState } from "react";

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!speechSupported()) return;

    const refresh = () => {
      window.speechSynthesis.getVoices();
    };
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      stopSpeaking();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    setError("");
    try {
      const utterance = speakEnglish(text);
      setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => {
        setSpeaking(false);
        setError("The browser could not play speech. Try the Replay button.");
      };
    } catch (caught) {
      setSpeaking(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Text-to-speech is not available.",
      );
    }
  }, []);

  const stop = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  return { speaking, error, speak, stop };
}
