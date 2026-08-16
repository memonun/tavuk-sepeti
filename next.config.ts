import path from "node:path";

import type { NextConfig } from "next";

import { CANONICAL_ORIGIN, CANONICAL_WWW_HOSTNAME } from "@/shared/canonical-origin";

const nextConfig: NextConfig = {
  // PayTR's live merchant credentials are domain-locked to exactly
  // https://apuhanciftligi.com (no www) — see shared/canonical-origin.ts. A
  // customer landing on www gets PayTR's "API bilgileri sadece ... için
  // tanımlıdır" error at checkout, so www is redirected to the canonical
  // apex before it ever reaches the storefront.
  //
  // The custom regex on `:path` excludes exactly /api/paytr/callback —
  // PayTR's server-to-server webhook POST — because PayTR does not follow
  // redirects on its callback request (confirmed empirically: a 308 here
  // was observed as a hard failure, not followed). Every other path,
  // including www itself, still redirects.
  async redirects() {
    return [
      {
        source: "/:path((?!api/paytr/callback$).*)",
        has: [{ type: "host", value: CANONICAL_WWW_HOSTNAME }],
        destination: `${CANONICAL_ORIGIN}/:path`,
        permanent: true,
      },
    ];
  },
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
