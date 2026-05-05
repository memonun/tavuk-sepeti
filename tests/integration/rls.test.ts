/**
 * RLS smoke tests — proves Row-Level Security is enforced on the live DB.
 *
 * Strategy:
 *   1. Service-role client inserts a sentinel row (RLS bypass — works).
 *   2. Anon client tries to SELECT it (RLS blocks — empty result, no error).
 *   3. Service-role cleans up.
 *
 * These tests skip in CI (NEXT_PUBLIC_SUPABASE_URL contains 'stub' there).
 * Run them locally with `pnpm test`. They hit the dev Supabase project, so
 * test data is namespaced with a UUID phone number to avoid collisions.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/shared/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Real Supabase keys are JWTs (start with 'eyJ'). CI fills these with
// "ci-anon-stub" / "ci-service-stub", which fail this check — tests skip.
const looksReal = (k: string) => k.startsWith("eyJ");
const isStubbed =
  !url.startsWith("https://") ||
  url.includes("example.") ||
  !looksReal(anonKey) ||
  !looksReal(serviceKey);

describe.skipIf(isStubbed)("RLS — customers table", () => {
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Phone is unique; randomize so re-runs and concurrent runs don't collide.
  const sentinelPhone = `+90555${String(Date.now()).slice(-7)}`;
  let sentinelId: string | null = null;

  beforeAll(async () => {
    const { data, error } = await admin
      .from("customers")
      .insert({
        first_name: "RLS",
        last_name: "Sentinel",
        phone: sentinelPhone,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`service-role insert failed: ${error.message}`);
    }
    sentinelId = data.id;
  });

  afterAll(async () => {
    if (sentinelId) {
      await admin.from("customers").delete().eq("id", sentinelId);
    }
  });

  it("service-role client can read the sentinel (RLS bypass)", async () => {
    const { data, error } = await admin
      .from("customers")
      .select("id, phone")
      .eq("phone", sentinelPhone);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(sentinelId);
  });

  it("anon client cannot read the sentinel (RLS blocks)", async () => {
    const { data, error } = await anon
      .from("customers")
      .select("id, phone")
      .eq("phone", sentinelPhone);

    // RLS doesn't 403 on SELECT — it filters rows. An anon read of a row
    // they aren't authorized to see returns an empty array, not an error.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("anon client cannot insert (RLS blocks)", async () => {
    const { error } = await anon.from("customers").insert({
      first_name: "Should",
      last_name: "Fail",
      phone: `+90555${String(Date.now() + 1).slice(-7)}`,
    });

    // INSERT with no matching policy fails loud.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // insufficient_privilege
  });
});
