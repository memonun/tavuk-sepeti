import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ANDROID_CERT_SHA256_FINGERPRINTS, ANDROID_PACKAGE_ID } from "@/shared/android-app";

describe("android app identity", () => {
  // Chrome compares these byte-for-byte against the installed APK; a typo does
  // not error anywhere, the app just silently gets its address bar back.
  it("lists at least one well-formed SHA-256 certificate fingerprint", () => {
    expect(ANDROID_CERT_SHA256_FINGERPRINTS.length).toBeGreaterThan(0);
    for (const fingerprint of ANDROID_CERT_SHA256_FINGERPRINTS) {
      expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  });

  it("matches the package id the APK is built with", () => {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "mobile/twa-manifest.json"), "utf8"),
    );
    expect(manifest).toMatchObject({ packageId: ANDROID_PACKAGE_ID });
  });
});
