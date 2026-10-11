/**
 * Identity of the Android app (a Trusted Web Activity that opens this site
 * full-screen). Chrome only hides its address bar when the site vouches for
 * the app: it fetches /.well-known/assetlinks.json and compares the package
 * name and signing-certificate fingerprint below against the installed APK.
 *
 * Both values are public by design (anyone can read them out of the APK); the
 * secret is the keystore itself, which lives outside the repo — see
 * docs/android-apk.md. An APK signed with any other key gets the address bar
 * back, so a new signing key must be ADDED here before it ships, never swapped
 * in (phones still running the old build would lose full-screen).
 *
 * Pure: zero env access, zero I/O.
 */
export const ANDROID_PACKAGE_ID = "com.apuhanciftligi.app";

export const ANDROID_CERT_SHA256_FINGERPRINTS: readonly string[] = [
  // Release keystore generated 2026-10-11 (sideloaded APK for the farm team).
  "AC:B9:DC:C9:DD:5F:DD:1F:A4:53:65:34:68:66:E1:1C:88:9E:E0:7E:3D:28:B1:E2:F1:49:A2:03:E8:3A:F9:53",
];
