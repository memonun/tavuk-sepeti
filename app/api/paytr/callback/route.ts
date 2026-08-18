/**
 * PayTR payment-result webhook (server-to-server POST, form-urlencoded).
 * PayTR retries until it receives the literal body "OK", so we return that only
 * after a verified notification is processed; anything else returns a 4xx so a
 * forged/garbled request is never treated as a paid order. Public by design
 * (PayTR's servers have no session) — it verifies the HMAC instead.
 */
import { revalidatePath } from "next/cache";

import { handlePaytrCallback } from "@/features/payments/application/paytr";
import { paytrCallbackSchema } from "@/features/payments/domain/paytr.schema";
import { logger } from "@/shared/logger";

export async function POST(request: Request) {
  const form = await request.formData();
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }

  const parsed = paytrCallbackSchema.safeParse(fields);
  if (!parsed.success) {
    logger.warn({}, "paytr_callback_bad_payload");
    return new Response("PAYTR notification failed: bad payload", { status: 400 });
  }

  const result = await handlePaytrCallback(parsed.data);
  if (!result.ok) {
    return new Response(`PAYTR notification failed: ${result.reason}`, {
      status: 400,
    });
  }

  // The booking above changed what "Siparişlerim" and the guest lookup should
  // say. Nothing else invalidates them — `place-order` revalidates /hesap at
  // order CREATION, i.e. before the customer is even sent to PayTR — so without
  // this a customer navigating back to /hesap could be served a render made
  // while the order was still unpaid, which is exactly the state the admin
  // panel had already moved past.
  revalidatePath("/hesap");
  revalidatePath("/siparis-sorgula");

  return new Response("OK");
}
