import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Standalone output for production deployment (systemd / Docker).
  // Has no effect on `next dev` — local development is unchanged.
  output: "standalone",
  // Include workspace deps (@snomed/types) in the standalone trace
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Inline BFF_URL at build time so Edge Runtime middleware can use it.
  // Edge middleware runs in a sandbox without access to Node.js process.env,
  // so the value must be baked in during `next build`.
  // In Docker: set ENV BFF_URL=http://bff:3001 before the build step.
  // In local dev: .env.local provides BFF_URL=http://localhost:3001.
  env: {
    BFF_URL: process.env.BFF_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
