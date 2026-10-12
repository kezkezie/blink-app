/** Voiceovers (2026-10-12): 1 credit per started 300 characters (about 20 s of speech). */
export const voiceoverCredits = (chars: number) => Math.max(1, Math.ceil(chars / 300));

/** The voices, in plain words (OpenAI tts-1 voice ids). */
export const VOICES = [
  { id: "nova", label: "Warm" },
  { id: "shimmer", label: "Bright" },
  { id: "alloy", label: "Neutral" },
  { id: "fable", label: "Storyteller" },
  { id: "echo", label: "Calm" },
  { id: "onyx", label: "Deep" },
] as const;
