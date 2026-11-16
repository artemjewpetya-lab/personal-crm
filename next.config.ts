import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy without nonces: Next.js puts inline scripts into every page (hydration
// data), so 'unsafe-inline' is allowed for scripts. A nonce would make every page dynamic.
// Fonts are served by the app itself (next/font), there are no third-party scripts or images.
// React needs 'unsafe-eval' only in development (for readable error stacks).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // frame-ancestors above does the same; this one is for old browsers
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Do not tell what the app is built with
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The Docker image runs the minimal standalone server (see Dockerfile).
  // Local builds keep the regular output, so `pnpm start` works as usual.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
