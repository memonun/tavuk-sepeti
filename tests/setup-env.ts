// Vitest setup: load .env before any test file imports modules that read
// process.env (notably shared/env.ts, which validates at import time).
//
// CI workflows already inject env vars directly, so dotenv here is a no-op
// in CI when no .env file exists.
import "dotenv/config";
