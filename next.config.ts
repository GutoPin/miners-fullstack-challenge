import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg'],
  // standalone is for the docker image only: it breaks vercel's build tracing
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
