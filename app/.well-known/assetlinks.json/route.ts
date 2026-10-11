import { NextResponse } from "next/server";

import {
  ANDROID_CERT_SHA256_FINGERPRINTS,
  ANDROID_PACKAGE_ID,
} from "@/shared/android-app";

// Digital Asset Links statement: tells Chrome that the Android app is allowed
// to show this site full-screen (no address bar). Public by design — it
// contains no secrets. Must be answered by the apex host directly: Chrome does
// not follow redirects when verifying it.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE_ID,
          sha256_cert_fingerprints: ANDROID_CERT_SHA256_FINGERPRINTS,
        },
      },
    ],
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
