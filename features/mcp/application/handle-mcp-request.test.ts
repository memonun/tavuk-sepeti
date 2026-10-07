import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/shared/errors/app-error";
import { err } from "@/shared/result";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const verifyMcpToken = vi.fn();
vi.mock("@/features/mcp/infrastructure/verify-mcp-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mcp/infrastructure/verify-mcp-token")>()),
  verifyMcpToken: (...a: unknown[]) => verifyMcpToken(...a),
}));
// The tools pull in half the app; the transport/auth path is what is under test.
vi.mock("@/features/mcp/application/register-panel-tools", () => ({
  registerPanelTools: vi.fn(),
}));

const { handleMcpRequest } = await import("@/features/mcp/application/handle-mcp-request");

function post(headers: Record<string, string> = {}): Request {
  return new Request("https://apuhanciftligi.com/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    }),
  });
}

describe("handleMcpRequest", () => {
  beforeEach(() => verifyMcpToken.mockReset());

  it("401s without a token and points at the resource metadata", async () => {
    const res = await handleMcpRequest(post());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      "https://apuhanciftligi.com/.well-known/oauth-protected-resource/api/mcp",
    );
    expect(verifyMcpToken).not.toHaveBeenCalled();
  });

  it("401s with invalid_token for a bad token", async () => {
    verifyMcpToken.mockResolvedValue(err(new UnauthorizedError({ message: "nope" })));
    const res = await handleMcpRequest(post({ authorization: "Bearer bad" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("403s for a non-admin", async () => {
    verifyMcpToken.mockResolvedValue(err(new ForbiddenError({ message: "no" })));
    const res = await handleMcpRequest(post({ authorization: "Bearer customer" }));
    expect(res.status).toBe(403);
  });

  it("rejects GET and DELETE (stateless server)", async () => {
    const get = await handleMcpRequest(new Request("https://apuhanciftligi.com/api/mcp"));
    expect(get.status).toBe(405);
    const del = await handleMcpRequest(
      new Request("https://apuhanciftligi.com/api/mcp", { method: "DELETE" }),
    );
    expect(del.status).toBe(405);
  });

  it("answers initialize for an admin", async () => {
    verifyMcpToken.mockResolvedValue({
      ok: true,
      value: { userId: "admin-1", client: {} },
    });
    const res = await handleMcpRequest(post({ authorization: "Bearer good" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(body.result?.serverInfo?.name).toBe("apuhan-panel");
  });
});
