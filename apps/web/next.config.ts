import path from 'path';
import { fileURLToPath } from 'url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Standalone output for production deployment (systemd / Docker).
  // Has no effect on `next dev` — local development is unchanged.
  output: 'standalone',
  // Include workspace deps (@snomed/types) in the standalone trace
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // BFF URL used by server-side fetches — NOT exposed to browser
  serverRuntimeConfig: {
    bffUrl: process.env.BFF_URL ?? 'http://localhost:3001',
  },
  // Only truly public vars here
  publicRuntimeConfig: {
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Quorum',
  },
};

export default nextConfig;
