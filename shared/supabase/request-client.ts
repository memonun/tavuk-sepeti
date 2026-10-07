// Request-scoped Supabase client override. Server-only.
//
// Panel code reaches the database through `createSupabaseServerClient()`, which
// authenticates from the browser's session COOKIES. Non-browser callers (the
// Claude MCP connector) authenticate with a `Authorization: Bearer <jwt>` header
// instead and have no cookies. Rather than duplicating every query, the caller
// wraps its work in `runWithSupabaseClient(client, fn)`; while `fn` runs,
// `createSupabaseServerClient()` returns that client, so the existing
// application-layer functions execute as the bearer's user — RLS and
// `is_admin()` apply unchanged.
//
// AsyncLocalStorage scopes the override to the async call chain of ONE request,
// so concurrent requests can never see each other's client.
import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/supabase/types";

export type RequestSupabaseClient = SupabaseClient<Database>;

const storage = new AsyncLocalStorage<RequestSupabaseClient>();

export function runWithSupabaseClient<T>(
  client: RequestSupabaseClient,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(client, fn);
}

export function getRequestSupabaseClient(): RequestSupabaseClient | undefined {
  return storage.getStore();
}
