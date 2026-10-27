import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is opened as 127.0.0.1 and from the LAN; without this Next 16 answers 403
  // for its JS chunks and nothing hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost", "10.0.0.175"],
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
