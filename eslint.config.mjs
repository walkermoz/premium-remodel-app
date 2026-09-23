import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@next/next/no-img-element": "off",
      // A full navigation after session expiry/logout intentionally clears cached private data.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".local/**",
    ".vercel/**",
    "playwright-report/**",
    "artifacts/**",
    "public/maplibre/**",
    "mobile/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
