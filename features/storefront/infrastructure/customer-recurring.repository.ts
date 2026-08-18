import "server-only";

/**
 * Customer self-service recurring order requests. Both writers are SECURITY
 * DEFINER RPCs (service_role only) — mirrors customer-account.repository.ts's
 * use of link_customer_account: the storefront has no direct INSERT/DELETE
 * policy on recurring_templates, only a plain SELECT policy for reads (see
 * recurring-order-request.ts's listMyRecurringTemplatesAction, which reads
 * via the normal cookie-bound client instead of this file).
 *
 * The RPCs aren't in the generated Database type, so this uses the
 * un-generated-RPC cast pattern used elsewhere in the codebase.
 */
import {
  AppError,
  ExternalApiError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export interface CreateCustomerRecurringTemplateInput {
  authUserId: string;
  cadence: "weekly" | "biweekly";
  dayOfWeek: number;
  items: ReadonlyArray<{ product_key: string; quantity: number }>;
  paymentMethod: "cash_on_delivery" | "bank_transfer";
  nextRunAt: Date;
}

/** Create-or-reject a customer's recurring order REQUEST. Returns the new template id. */
export async function createCustomerRecurringTemplate(
  input: CreateCustomerRecurringTemplateInput,
): Promise<Result<string, AppError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "create_customer_recurring_template",
    {
      p_auth_user_id: input.authUserId,
      p_cadence: input.cadence,
      p_day_of_week: input.dayOfWeek,
      p_items: input.items,
      p_payment_method: input.paymentMethod,
      p_next_run_at: input.nextRunAt.toISOString(),
    },
  );
  if (error) {
    if (error.code === "P0002") {
      return err(
        new ValidationError({
          message: "Profiliniz bulunamadı. Sayfayı yenileyip tekrar deneyin.",
        }),
      );
    }
    if (error.code === "P0007") {
      return err(
        new ValidationError({
          message: "Önce hesabınıza bir teslimat adresi ekleyin.",
        }),
      );
    }
    if (error.code === "P0008") {
      return err(
        new ValidationError({
          message:
            "En fazla 3 düzenli sipariş talebiniz olabilir. Yeni talep için önce birini iptal edin.",
        }),
      );
    }
    if (error.code === "P0009") {
      return err(
        new ValidationError({ message: "Geçersiz sıklık veya ödeme yöntemi." }),
      );
    }
    if (error.code === "P0001") {
      return err(
        new ValidationError({ message: "En az bir ürün seçmelisiniz." }),
      );
    }
    logger.error(
      { code: error.code, message: error.message },
      "create_customer_recurring_template_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(String(data));
}

/** Cancel (soft) one of the caller's own recurring templates. */
export async function cancelCustomerRecurringTemplate(
  authUserId: string,
  templateId: string,
): Promise<Result<void, AppError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "cancel_customer_recurring_template",
    { p_auth_user_id: authUserId, p_template_id: templateId },
  );
  if (error) {
    if (error.code === "P0002") {
      return err(
        new ValidationError({
          message: "Profiliniz bulunamadı. Sayfayı yenileyip tekrar deneyin.",
        }),
      );
    }
    if (error.code === "P0004") {
      return err(
        new ValidationError({ message: "Bu talep hesabınıza ait değil." }),
      );
    }
    logger.error(
      { code: error.code, message: error.message },
      "cancel_customer_recurring_template_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
