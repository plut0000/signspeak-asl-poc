export type AppMode = "live" | "mock";

export type StatusResponse = {
  mode: AppMode;
  model: string;
};

export type InterpretSuccess = {
  english: string;
  unclear: boolean;
  reason: string;
  mock: boolean;
};

export type InterpretFailure = {
  error: string;
};
