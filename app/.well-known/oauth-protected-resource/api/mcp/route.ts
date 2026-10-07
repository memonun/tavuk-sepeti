import { NextResponse } from "next/server";

import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";
import { env } from "@/shared/env";

// RFC 9728 protected-resource metadata. Tells an MCP client (claude.ai) which
// authorization server issues tokens for /api/mcp: Supabase Auth's OAuth 2.1
// server. Public by design — it contains no secrets.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    {
      resource: `${CANONICAL_ORIGIN}/api/mcp`,
      authorization_servers: [`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "Apuhan Çiftliği Panel",
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
