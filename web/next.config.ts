import type { NextConfig } from "next";

const config: NextConfig = {
  // The agent package ships TypeScript directly; tell Next to compile it.
  transpilePackages: ["@forethought/agent"],

  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // The retrieval index and the per-article JSON live on disk and are read
  // via fs.readFile from server routes. Tell Next's tracer to bundle them
  // into the serverless function output so production deploys can find them.
  outputFileTracingIncludes: {
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
