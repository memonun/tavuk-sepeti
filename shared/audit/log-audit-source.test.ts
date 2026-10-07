/**
 * Requests from the Claude connector are stamped `source: "mcp"` on every audit
 * row via the request scope — the individual actions don't know where they were
 * called from. Panel requests (no scope) must be left exactly as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/shared/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({ from: () => ({ insert }) }),
}));

const { logAudit } = await import("@/shared/audit/log-audit");
const { runWithSupabaseClient } = await import("@/shared/supabase/request-client");

const entry = {
  actor_id: "admin-1",
  action: "order.updated" as const,
  entity_type: "order" as const,
  entity_id: "o1",
};

type Row = { metadata: unknown };

describe("audit source tagging", () => {
  beforeEach(() => insert.mockClear());

  it("tags rows written inside a connector request", async () => {
    await runWithSupabaseClient({} as never, () => logAudit({ ...entry, metadata: { reason: "x" } }), {
      source: "mcp",
    });
    const rows = insert.mock.calls[0]?.[0] as Row[];
    expect(rows[0]?.metadata).toEqual({ source: "mcp", reason: "x" });
  });

  it("tags rows that had no metadata of their own", async () => {
    await runWithSupabaseClient({} as never, () => logAudit(entry), { source: "mcp" });
    expect((insert.mock.calls[0]?.[0] as Row[])[0]?.metadata).toEqual({ source: "mcp" });
  });

  it("leaves panel writes untouched", async () => {
    await logAudit(entry);
    expect((insert.mock.calls[0]?.[0] as Row[])[0]?.metadata).toBeNull();
  });
});
