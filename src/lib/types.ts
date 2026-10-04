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
    margin?: number;
    maxIsolatedMs?: number;
    maxIsolatedFrames?: number;
    classes: number;
    architecture: string;
    version: string;
    variant: string;
    label: string;
  };
};

export type SignSegmentCounts = {
  /** Single-sign segments found in a clip longer than one isolated sign. */
  total: number;
  /** Segments that cleared the dedicated-model gates. */
  confident: number;
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
  /** Several signs in a row, in signed order, after merging repeats. */
  glosses?: DedicatedTop[];
  segments?: SignSegmentCounts;
  fallbackReason?: string;
  dedicatedTop?: DedicatedTop;
};

export type InterpretFailure = {
  error: string;
  fallbackReason?: string;
  dedicatedTop?: DedicatedTop;
};
