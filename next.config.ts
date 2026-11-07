import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // 8 MB documents plus multipart overhead; the app enforces 8 MB itself.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
