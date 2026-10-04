import type { LandmarkSample } from "@/lib/pack-landmark-sample";
import type { LandmarkDelegates } from "@/lib/landmark-runtime";
import type {
  LandmarkWorkerRequest,
  LandmarkWorkerResponse,
} from "@/lib/landmark-worker-protocol";

const INIT_TIMEOUT_MS = 30_000;

export type LandmarkDetectInput =
  | HTMLVideoElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas;

export function workerDetectSupported() {
  return (
    typeof window !== "undefined" &&
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof createImageBitmap === "function"
  );
}

export class LandmarkWorkerClient {
  private worker: Worker | null = null;
  private pending: {
    resolve: (sample: LandmarkSample | null) => void;
    reject: (error: Error) => void;
  } | null = null;
  delegates: LandmarkDelegates | null = null;

  async start(): Promise<LandmarkDelegates> {
    if (this.delegates && this.worker) return this.delegates;
    if (!workerDetectSupported()) {
      throw new Error("Landmark workers are not supported in this browser.");
    }

    const worker = new Worker(
      new URL("./landmark-detect.worker.ts", import.meta.url),
      { type: "module", name: "signspeak-landmarks" },
    );
    this.worker = worker;

    const delegates = await new Promise<LandmarkDelegates>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Landmark worker init timed out."));
      }, INIT_TIMEOUT_MS);

      const fail = (error: Error) => {
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(error);
      };

      const onError = (event: ErrorEvent) => {
        fail(event.error instanceof Error ? event.error : new Error(event.message));
      };

      const onMessage = (event: MessageEvent<LandmarkWorkerResponse>) => {
        const data = event.data;
        if (data.type === "ready") {
          window.clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          resolve(data.delegates);
          return;
        }
        if (data.type === "error") {
          fail(new Error(data.message));
        }
      };

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      post(worker, { type: "init" });
    }).catch((error) => {
      this.terminate();
      throw error;
    });

    this.delegates = delegates;
    worker.addEventListener("message", (event: MessageEvent<LandmarkWorkerResponse>) => {
      this.onMessage(event.data);
    });
    worker.addEventListener("error", (event) => {
      this.failPending(
        event.error instanceof Error ? event.error : new Error(event.message),
      );
    });
    return delegates;
  }

  async detect(
    source: LandmarkDetectInput,
    timestamp: number,
  ): Promise<LandmarkSample | null> {
    const worker = this.worker;
    if (!worker) throw new Error("Landmark worker is not started.");
    if (this.pending) {
      throw new Error("Landmark worker already has a detect in flight.");
    }

    const bitmap =
      typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap
        ? source
        : await createImageBitmap(source);

    return new Promise<LandmarkSample | null>((resolve, reject) => {
      this.pending = { resolve, reject };
      try {
        post(worker, { type: "detect", bitmap, timestamp }, [bitmap]);
      } catch (caught) {
        this.pending = null;
        try {
          bitmap.close();
        } catch {
          // Transfer may have already detached the bitmap.
        }
        reject(
          caught instanceof Error
            ? caught
            : new Error("Could not send a frame to the landmark worker."),
        );
      }
    });
  }

  resetClock() {
    if (!this.worker) return;
    post(this.worker, { type: "resetClock" });
  }

  terminate() {
    this.failPending(new Error("Landmark worker was stopped."));
    this.worker?.terminate();
    this.worker = null;
    this.delegates = null;
  }

  private onMessage(data: LandmarkWorkerResponse) {
    if (data.type === "error") {
      this.failPending(new Error(data.message));
      return;
    }
    if (data.type !== "result") return;
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    if (!data.ok) {
      pending.resolve(null);
      return;
    }
    pending.resolve({
      frame: new Float32Array(data.buffer),
      hasPose: data.hasPose,
      hasHand: data.hasHand,
      leftHand: data.leftHand,
      rightHand: data.rightHand,
    });
  }

  private failPending(error: Error) {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }
}

function post(
  worker: Worker,
  message: LandmarkWorkerRequest,
  transfer?: Transferable[],
) {
  if (transfer?.length) {
    worker.postMessage(message, transfer);
  } else {
    worker.postMessage(message);
  }
}
