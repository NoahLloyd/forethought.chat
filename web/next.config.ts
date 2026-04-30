import type { NextConfig } from "next";

const config: NextConfig = {
  // The agent package ships TypeScript directly; tell Next to compile it.
  transpilePackages: ["@forethought/agent"],

  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // The retrieval index lives on disk and is read via fs.readFile from
  // server routes. Tell Next's tracer to bundle it into the serverless
  // function output so production deploys can find it.
  outputFileTracingIncludes: {
    "/": ["./data/index.json"],
    "/about": ["./data/index.json"],
    "/sitemap.xml": ["./data/index.json"],
    "/api/chat": ["./data/index.json"],
    "/api/catalog": ["./data/index.json"],
  },
};

export default config;
