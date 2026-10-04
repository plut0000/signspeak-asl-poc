import { statSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

// Load with `node --import ./scripts/src-alias.mjs` so verify scripts can
// import src/ modules that use the tsconfig "@/*" path alias.
if (isMainThread) register(import.meta.url);

const SRC = new URL("../src/", import.meta.url);
const CANDIDATES = [".ts", ".tsx", "/index.ts", ""];

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = fileURLToPath(new URL(specifier.slice(2), SRC));
    for (const suffix of CANDIDATES) {
      if (isFile(base + suffix)) {
        return nextResolve(pathToFileURL(base + suffix).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
