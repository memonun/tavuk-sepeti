// Build the signed Android APK (a Trusted Web Activity that opens the live site).
//
//   pnpm android:apk
//
// Input is mobile/twa-manifest.json; output is mobile/android-build/apuhan-<version>.apk.
// The Android project itself is generated, never committed: Bubblewrap writes it from the
// manifest, Gradle builds it, and the SDK's zipalign + apksigner sign it.
//
// Why not `bubblewrap build`: it refuses an Android Studio SDK (it wants the old
// command-line-tools layout), so only its project generator is used here.
//
// Needs: JDK 17, an Android SDK with a build-tools version installed, and the release
// keystore. Keystore location and passwords come from the environment, or from
// ~/.apuhan-android/keystore.env when the variables are not set — see docs/android-apk.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BUBBLEWRAP = "@bubblewrap/cli@1.27.0";
const MANIFEST = "mobile/twa-manifest.json";
const BUILD_DIR = "mobile/android-build";
const KEYSTORE_ENV_FILE = path.join(os.homedir(), ".apuhan-android", "keystore.env");
const REQUIRED_ENV = [
  "APUHAN_KEYSTORE_PATH",
  "APUHAN_KEY_ALIAS",
  "BUBBLEWRAP_KEYSTORE_PASSWORD",
  "BUBBLEWRAP_KEY_PASSWORD",
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) fail(`Başarısız: ${command} ${args.join(" ")}`);
}

function loadKeystoreEnv() {
  if (REQUIRED_ENV.every((key) => process.env[key])) return;
  if (!fs.existsSync(KEYSTORE_ENV_FILE)) {
    fail(`İmza anahtarı bilgileri yok: ${REQUIRED_ENV.join(", ")} (veya ${KEYSTORE_ENV_FILE}).`);
  }
  for (const line of fs.readFileSync(KEYSTORE_ENV_FILE, "utf8").split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) fail(`Eksik değişken: ${missing.join(", ")}`);
}

function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
  ];
  const found = candidates.find((dir) => dir && fs.existsSync(path.join(dir, "bin", "java")));
  if (!found) fail("JDK 17 bulunamadı. JAVA_HOME ayarla.");
  return found;
}

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
  ];
  const found = candidates.find((dir) => dir && fs.existsSync(path.join(dir, "build-tools")));
  if (!found) fail("Android SDK bulunamadı. ANDROID_HOME ayarla.");
  return found;
}

function newestBuildTools(sdk) {
  const versions = fs
    .readdirSync(path.join(sdk, "build-tools"))
    .filter((name) => fs.existsSync(path.join(sdk, "build-tools", name, "apksigner")))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const newest = versions.at(-1);
  if (!newest) fail("Android SDK içinde build-tools yok (apksigner bulunamadı).");
  return path.join(sdk, "build-tools", newest);
}

/** Bubblewrap prompts interactively for these paths unless its config already exists. */
function ensureBubblewrapConfig(javaHome, sdk) {
  const file = path.join(os.homedir(), ".bubblewrap", "config.json");
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // On macOS Bubblewrap expects the bundle directory, i.e. JAVA_HOME without /Contents/Home.
  const jdkPath = javaHome.replace(/\/Contents\/Home\/?$/, "");
  fs.writeFileSync(file, `${JSON.stringify({ jdkPath, androidSdkPath: sdk })}\n`);
}

loadKeystoreEnv();
const javaHome = resolveJavaHome();
const sdk = resolveAndroidSdk();
const buildTools = newestBuildTools(sdk);
ensureBubblewrapConfig(javaHome, sdk);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const keystorePath = process.env.APUHAN_KEYSTORE_PATH;
if (!fs.existsSync(keystorePath)) fail(`Keystore bulunamadı: ${keystorePath}`);
manifest.signingKey = { path: keystorePath, alias: process.env.APUHAN_KEY_ALIAS };

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.writeFileSync(path.join(BUILD_DIR, "twa-manifest.json"), JSON.stringify(manifest, null, 2));

const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
run("npx", ["--yes", BUBBLEWRAP, "update", "--skipVersionUpgrade"], { cwd: BUILD_DIR, env });
run("./gradlew", ["assembleRelease", "--no-daemon", "-q"], { cwd: BUILD_DIR, env });

const unsigned = path.join(BUILD_DIR, "app/build/outputs/apk/release/app-release-unsigned.apk");
const aligned = path.join(BUILD_DIR, "app-release-aligned.apk");
const output = path.join(BUILD_DIR, `apuhan-${manifest.appVersionName}.apk`);

run(path.join(buildTools, "zipalign"), ["-f", "-p", "4", unsigned, aligned]);
// Passwords are handed over through the environment so they never appear in the process list.
run(
  path.join(buildTools, "apksigner"),
  [
    "sign",
    "--ks", keystorePath,
    "--ks-key-alias", process.env.APUHAN_KEY_ALIAS,
    "--ks-pass", "env:BUBBLEWRAP_KEYSTORE_PASSWORD",
    "--key-pass", "env:BUBBLEWRAP_KEY_PASSWORD",
    "--out", output,
    aligned,
  ],
  { env },
);
run(path.join(buildTools, "apksigner"), ["verify", "--print-certs", output], { env });

process.stdout.write(`\nAPK hazır: ${output}\n`);
