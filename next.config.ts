import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's notion of the workspace root to this repo so it doesn't
  // walk up the filesystem and pick up an unrelated lockfile in the user's
  // home directory.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
