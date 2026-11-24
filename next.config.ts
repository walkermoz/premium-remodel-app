import type { NextConfig } from "next";

const inlinePdfHeaders = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value:
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https://js.stripe.com https://hooks.stripe.com; base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const config: NextConfig = {
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": ["./.local/**", "./artifacts/**", "./tests/**", "./scripts/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https://js.stripe.com https://hooks.stripe.com; base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
      {
        // Only the authenticated, inline quote preview may be framed by this site.
        source: "/api/quotes/:id/pdf",
        has: [{ type: "query", key: "view", value: "1" }],
        headers: inlinePdfHeaders,
      },
      {
        // The on-device signature reviews this exact private revision. Token
        // authorization and no-store remain enforced by the PDF route.
        source: "/api/client-quote/:token/pdf",
        has: [{ type: "query", key: "view", value: "1" }],
        headers: inlinePdfHeaders,
      },
      {
        source: "/client/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/api/files",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; sandbox",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
export default config;
