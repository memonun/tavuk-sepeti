/**
 * PayTR payment-result callback payload (POST, application/x-www-form-urlencoded).
 * Parsed before the hash is verified. Only the fields we act on are required;
 * PayTR sends more, which we ignore.
 */
import { z } from "zod";

export const paytrCallbackSchema = z.object({
  merchant_oid: z.string().min(1),
  status: z.string().min(1), // "success" | "failed"
  total_amount: z.string().min(1), // kuruş, as string
  hash: z.string().min(1),
  failed_reason_code: z.string().optional(),
  failed_reason_msg: z.string().optional(),
});

export type PaytrCallback = z.output<typeof paytrCallbackSchema>;
