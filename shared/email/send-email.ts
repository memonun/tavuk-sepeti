/**
 * Minimal transactional-email sender (Resend HTTP API, no SDK dependency).
 *
 * Best-effort by design: when RESEND_API_KEY / EMAIL_FROM are unset it returns
 * `skipped_not_configured` rather than failing, so callers (e.g. storefront
 * order confirmation) never block their main flow on email. Server-only —
 * the API key must never reach the browser.
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export type SendEmailOutcome = "sent" | "skipped_not_configured";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<Result<SendEmailOutcome, ExternalApiError>> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey || !from) {
    logger.warn({}, "email_not_configured_skipped");
    return ok("skipped_not_configured");
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "resend_send_failed");
      return err(
        new ExternalApiError({
          message: `E-posta gönderilemedi (${response.status}).`,
        }),
      );
    }

    return ok("sent");
  } catch (cause) {
    logger.error(
      { message: cause instanceof Error ? cause.message : "unknown" },
      "resend_send_exception",
    );
    return err(new ExternalApiError({ message: "E-posta gönderilemedi.", cause }));
  }
}
