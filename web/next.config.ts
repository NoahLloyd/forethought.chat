import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // The retrieval index and the per-article JSON live on disk and are read
  // via fs.readFile from server routes. Tell Next's tracer to bundle them
  // into the serverless function output so production deploys can find them.
  outputFileTracingIncludes: {
    // Every route that calls getCatalog/corpusStats reads data/index.json,
    // including the static home/about/browse pages on revalidation. Be
    // explicit so the Vercel serverless bundle includes the file for all
    // of them.
    "/": ["./data/index.json"],
    "/about": ["./data/index.json"],
    "/browse": ["./data/index.json"],
    "/sitemap.xml": ["./data/index.json"],
    "/api/chat": ["./data/index.json"],
    "/api/catalog": ["./data/index.json"],
    "/article/**": ["./data/content/**", "./data/index.json"],
  },
};

export default config;
