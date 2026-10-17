import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The Docker image runs the minimal standalone server (see Dockerfile).
  // Local builds keep the regular output, so `pnpm start` works as usual.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
