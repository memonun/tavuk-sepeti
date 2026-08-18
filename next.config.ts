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
  //
  // WARNING — this exclusion does NOT protect the webhook in production, and
  // must not be relied on. The www host is ALSO redirected at the Vercel
  // domain level, which runs at the edge before Next.js sees the request:
  //
  //   $ curl -sI -X POST https://www.apuhanciftligi.com/api/paytr/callback
  //   HTTP/2 308
  //   location: https://apuhanciftligi.com/api/paytr/callback
  //   server: Vercel                    ← no x-matched-path: never reached Next
  //
  // So the ONLY thing keeping card payments booked is that PayTR's merchant
  // panel points its notification URL at the APEX host. Point it at www and
  // every notification is answered with a 308, dropped, and the payment is
  // never written to the ledger — the order stays unpaid for the customer
  // while the money sits in PayTR. Verify that setting before touching
  // anything here, and keep this redirect as-is regardless: it is the
  // apex-only PayTR credential lock, not webhook protection.
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
