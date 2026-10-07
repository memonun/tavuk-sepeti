/**
 * Serves one MCP (streamable HTTP) request, stateless: a fresh server +
 * transport per request, JSON responses, no sessions. That fits serverless —
 * nothing to keep alive between invocations — and every request re-verifies the
 * bearer token, so a revoked connector stops working immediately.
 */
import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { registerPanelTools } from "@/features/mcp/application/register-panel-tools";
import {
  extractBearerToken,
  verifyMcpToken,
} from "@/features/mcp/infrastructure/verify-mcp-token";
import { checkRateLimit } from "@/features/mcp/infrastructure/rate-limit";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { runWithSupabaseClient } from "@/shared/supabase/request-client";

/** RFC 9728 metadata URL — what an unauthenticated client is pointed at. */
export const MCP_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/api/mcp";

const SERVER_INFO = { name: "apuhan-panel", version: "1.0.0" } as const;

function jsonRpcError(status: number, message: string, headers: HeadersInit = {}): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );
}

function unauthorized(message: string, invalidToken: boolean): Response {
  const resourceMetadata = `${CANONICAL_ORIGIN}${MCP_RESOURCE_METADATA_PATH}`;
  const challenge = invalidToken
    ? `Bearer error="invalid_token", resource_metadata="${resourceMetadata}"`
    : `Bearer resource_metadata="${resourceMetadata}"`;
  return jsonRpcError(401, message, { "www-authenticate": challenge });
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  // Stateless server: there is no session to resume (GET) or terminate (DELETE).
  if (request.method !== "POST") {
    return jsonRpcError(405, "Yalnızca POST desteklenir.", { allow: "POST" });
  }

  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized("Kimlik doğrulama gerekli.", false);

  const verified = await verifyMcpToken(token);
  if (!verified.ok) {
    return verified.error.code === ErrorCode.UNAUTHORIZED
      ? unauthorized(verified.error.message, true)
      : jsonRpcError(403, verified.error.message);
  }
  const { userId, client } = verified.value;

  const limit = checkRateLimit(userId);
  if (!limit.allowed) {
    logger.warn({ userId }, "mcp_rate_limited");
    return jsonRpcError(429, "Çok fazla istek, biraz sonra tekrar deneyin.", {
      "retry-after": String(limit.retryAfterSeconds),
    });
  }

  const server = new McpServer(SERVER_INFO);
  registerPanelTools(server, { id: userId });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    return await runWithSupabaseClient(client, () => transport.handleRequest(request), {
      source: "mcp",
    });
  } finally {
    // Response is fully materialised (JSON mode); release the per-request server.
    void server.close().catch((cause: unknown) => {
      logger.warn({ message: String(cause) }, "mcp_server_close_failed");
    });
  }
}
