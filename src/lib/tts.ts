export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function pickEnglishVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith("en") &&
        /google|samantha|daniel|natural|premium/i.test(voice.name),
    ) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

export function speakEnglish(text: string) {
  if (!speechSupported()) {
    throw new Error("This browser does not support text-to-speech.");
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  const voice = pickEnglishVoice();
  if (voice) utterance.voice = voice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking() {
  if (speechSupported()) {
    window.speechSynthesis.cancel();
  }
}
