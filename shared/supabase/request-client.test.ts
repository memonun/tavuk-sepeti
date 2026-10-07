import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getRequestSupabaseClient, runWithSupabaseClient } = await import(
  "@/shared/supabase/request-client"
);

type Client = Parameters<typeof runWithSupabaseClient>[0];
const fake = (name: string) => ({ name }) as unknown as Client;

describe("runWithSupabaseClient", () => {
  it("is empty outside a scope", () => {
    expect(getRequestSupabaseClient()).toBeUndefined();
  });

  it("exposes the client through awaits inside the scope, and clears it after", async () => {
    const a = fake("a");
    const seen = await runWithSupabaseClient(a, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return getRequestSupabaseClient();
    });
    expect(seen).toBe(a);
    expect(getRequestSupabaseClient()).toBeUndefined();
  });

  it("keeps concurrent requests isolated", async () => {
    const [x, y] = await Promise.all([
      runWithSupabaseClient(fake("x"), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestSupabaseClient();
      }),
      runWithSupabaseClient(fake("y"), async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getRequestSupabaseClient();
      }),
    ]);
    expect((x as unknown as { name: string }).name).toBe("x");
    expect((y as unknown as { name: string }).name).toBe("y");
  });
});
