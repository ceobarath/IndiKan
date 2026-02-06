import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Silence workspace-root inference warnings when multiple lockfiles exist.
    // Must be an absolute path.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
