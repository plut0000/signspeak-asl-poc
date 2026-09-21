import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@google/genai", "onnxruntime-node"],
  outputFileTracingIncludes: {
    "/api/interpret": [
      "./models/asl-citizen-bilstm100/**/*",
      "./node_modules/onnxruntime-node/**/*",
    ],
  },
};

export default nextConfig;
