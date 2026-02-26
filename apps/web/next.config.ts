import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
