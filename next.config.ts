import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's notion of the workspace root to this repo so it doesn't
  // walk up the filesystem and pick up an unrelated lockfile in the user's
  // home directory.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  // Tree-shake big barrel imports (lucide-react has hundreds of icons) so each
  // page only ships the icons it uses.
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Product image uploads flow through a server action; images are compressed
    // client-side first, but allow headroom up to the 5 MB bucket limit in case
    // a browser can't re-encode and sends the original.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    // Product cover images served from the public Supabase Storage bucket.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
