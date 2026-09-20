export type AppMode = "live" | "mock";

export type InterpretSource = "dedicated" | "gemini";

export type DedicatedTop = {
  gloss: string;
  glossLabel: string;
  confidence: number;
};

export type StatusResponse = {
  mode: AppMode;
  model: string;
  dedicated: {
    enabled: boolean;
    threshold: number;
    classes: number;
    architecture: string;
  };
};

export type InterpretSuccess = {
  english: string;
  unclear: boolean;
  reason: string;
  mock: boolean;
  source?: InterpretSource;
  gloss?: string;
  glossLabel?: string;
  confidence?: number;
  fallbackReason?: string;
  dedicatedTop?: DedicatedTop;
};

export type InterpretFailure = {
  error: string;
};
