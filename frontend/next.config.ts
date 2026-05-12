import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Standalone output so the docker image stays small — Next bundles only the
  // server runtime + the route closures, not node_modules. The Dockerfile in
  // PR #6's docker-compose wiring will use this.
  output: "standalone",
  experimental: {
    // MUI emits its styled-engine modules in a way that benefits from
    // package transpilation under Next 15. Without this, MUI's ESM exports
    // can trip dev server warnings on first build.
    optimizePackageImports: ["@mui/material", "@mui/icons-material"],
  },
};

export default config;
