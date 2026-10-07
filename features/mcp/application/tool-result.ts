/**
 * MCP tool result helpers. Tool output is JSON text for the model to read.
 *
 * Errors follow CLAUDE.md §5/§6: every failure carries a correlation id, is
 * logged, and INTERNAL / upstream (Supabase) messages are masked — the model
 * gets a Turkish, user-presentable message, not a raw database error.
 */
import "server-only";

import { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Keeps a single tool response comfortably inside the model's context. */
export const MAX_TOOL_OUTPUT_CHARS = 100_000;

const MASKED_CODES: ReadonlySet<string> = new Set([
  ErrorCode.INTERNAL_ERROR,
  ErrorCode.EXTERNAL_API_ERROR,
]);

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);
  return value;
}

export function toolJson(value: unknown): CallToolResult {
  let text = JSON.stringify(value, replacer, 2);
  if (text.length > MAX_TOOL_OUTPUT_CHARS) {
    text =
      text.slice(0, MAX_TOOL_OUTPUT_CHARS) +
      "\n… (çıktı kesildi; daha dar bir filtre veya daha küçük pageSize kullanın)";
  }
  return { content: [{ type: "text", text }] };
}

export function toolMessage(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }] };
}

export function toolError(
  tool: string,
  error: unknown,
  context: Record<string, unknown> = {},
): CallToolResult {
  const correlationId = crypto.randomUUID();
  const appError = AppError.is(error) ? error : null;
  const code = appError?.code ?? ErrorCode.INTERNAL_ERROR;

  logger.error(
    { tool, code, correlationId, message: appError?.message, ...context },
    "mcp_tool_failed",
  );

  const message = MASKED_CODES.has(code) || !appError
    ? "İşlem tamamlanamadı."
    : appError.message;

  return {
    isError: true,
    content: [
      { type: "text", text: JSON.stringify({ ok: false, code, message, correlationId }) },
    ],
  };
}

/** A domain refusal the model should relay as-is (state machine, validation…). */
export function toolRefusal(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ ok: false, message }) }],
  };
}

/** Adapts the panel's `Result<T, AppError>` actions: value → JSON, error → masked tool error. */
export function toolFromResult<T>(
  tool: string,
  result: Result<T, AppError>,
  context: Record<string, unknown> = {},
): CallToolResult {
  return result.ok ? toolJson({ ok: true, result: result.value ?? null }) : toolError(tool, result.error, context);
}

/**
 * Adapts the panel's form-style `{ status }` actions. `success` → JSON with the
 * remaining fields; `validation_error` → the field errors (the model can fix and
 * retry); `error` → a refusal carrying the action's Turkish message.
 */
export function toolFromState(
  state:
    | { status: "success"; [key: string]: unknown }
    | { status: "validation_error"; fieldErrors: Record<string, string[]> }
    | { status: "error"; message: string }
    | { status: "idle" },
): CallToolResult {
  switch (state.status) {
    case "success": {
      const { status: _status, ...rest } = state;
      return toolJson({ ok: true, ...rest });
    }
    case "validation_error":
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: false, message: "Geçersiz alanlar.", fieldErrors: state.fieldErrors }),
          },
        ],
      };
    case "error":
      return toolRefusal(state.message);
    default:
      return toolRefusal("İşlem tamamlanamadı.");
  }
}
