import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dictionary is read at runtime by the enrichment API: ship it with the functions.
  outputFileTracingIncludes: {
    "/api/enrich": ["./data/cedict.txt.gz"],
    "/api/quiz": ["./data/cedict.txt.gz"],
  },
  serverExternalPackages: ["@libsql/client"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
