import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@/shared/errors/error-codes";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  },
}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const getUser = vi.fn();
const rpc = vi.fn();
const createClient = vi.fn((..._args: unknown[]) => ({ auth: { getUser }, rpc }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

const { extractBearerToken, verifyMcpToken } = await import(
  "@/features/mcp/infrastructure/verify-mcp-token"
);

describe("extractBearerToken", () => {
  it("reads a well-formed header", () => {
    expect(extractBearerToken("Bearer abc.def-ghi_1")).toBe("abc.def-ghi_1");
    expect(extractBearerToken("bearer abc")).toBe("abc");
  });

  it.each([null, "", "Basic abc", "Bearer", "Bearer a b", "abc"])(
    "rejects %j",
    (value) => {
      expect(extractBearerToken(value)).toBeNull();
    },
  );
});

describe("verifyMcpToken", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    createClient.mockClear();
  });

  it("binds the client to the bearer token (no service-role key)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });

    const result = await verifyMcpToken("tok");

    expect(result.ok).toBe(true);
    expect(getUser).toHaveBeenCalledWith("tok");
    const [url, key, options] = createClient.mock.calls[0] as [
      string,
      string,
      { global: { headers: Record<string, string> } },
    ];
    expect(url).toBe("https://example.supabase.co");
    expect(key).toBe("anon");
    expect(options.global.headers.Authorization).toBe("Bearer tok");
  });

  it("returns the user id for an admin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    const result = await verifyMcpToken("tok");
    expect(result.ok && result.value.userId).toBe("u1");
  });

  it("rejects an invalid or expired token as UNAUTHORIZED", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const result = await verifyMcpToken("bad");
    expect(!result.ok && result.error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin (customer) token as FORBIDDEN", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "customer" } }, error: null });
    rpc.mockResolvedValue({ data: false, error: null });
    const result = await verifyMcpToken("tok");
    expect(!result.ok && result.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it("fails closed when the is_admin check errors", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    const result = await verifyMcpToken("tok");
    expect(!result.ok && result.error.code).toBe(ErrorCode.FORBIDDEN);
  });
});
