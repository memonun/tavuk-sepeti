import { handleMcpRequest } from "@/features/mcp/application/handle-mcp-request";

// Claude connector endpoint (MCP over streamable HTTP). Auth, rate limiting and
// the tool surface live in features/mcp; this file is only the route shell.
// Public URL: https://apuhanciftligi.com/api/mcp (apex — www is redirected).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
