import { describe, expect, it, vi } from "vitest";

import { ExternalApiError, ValidationError } from "@/shared/errors/app-error";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { MAX_TOOL_OUTPUT_CHARS, toolError, toolJson } = await import(
  "@/features/mcp/application/tool-result"
);

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("toolJson", () => {
  it("serialises Maps and Sets (the agenda groups tasks in a Map)", () => {
    const out = text(toolJson({ m: new Map([["2026-10-07", [1]]]), s: new Set([1, 2]) }) as never);
    expect(JSON.parse(out)).toEqual({ m: { "2026-10-07": [1] }, s: [1, 2] });
  });

  it("truncates oversized output with a hint", () => {
    const out = text(toolJson({ blob: "x".repeat(MAX_TOOL_OUTPUT_CHARS * 2) }) as never);
    expect(out.length).toBeLessThan(MAX_TOOL_OUTPUT_CHARS + 200);
    expect(out).toContain("çıktı kesildi");
  });
});

describe("toolError", () => {
  it("masks upstream database errors but keeps a correlation id", () => {
    const result = toolError(
      "list_orders",
      new ExternalApiError({ message: 'relation "orders" does not exist' }),
    );
    const body = JSON.parse(text(result as never)) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(body.message).toBe("İşlem tamamlanamadı.");
    expect(JSON.stringify(body)).not.toContain("does not exist");
    expect(typeof body.correlationId).toBe("string");
  });

  it("passes user-presentable validation messages through", () => {
    const body = JSON.parse(
      text(toolError("t", new ValidationError({ message: "Geçersiz dönem." })) as never),
    ) as Record<string, unknown>;
    expect(body.message).toBe("Geçersiz dönem.");
  });

  it("masks unknown thrown values", () => {
    const body = JSON.parse(text(toolError("t", new Error("secret db password")) as never)) as Record<
      string,
      unknown
    >;
    expect(body.message).toBe("İşlem tamamlanamadı.");
  });
});
