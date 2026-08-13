"use server";

/**
 * Admin edit of the storefront rules — the "değiştirebileyim" half of the
 * delivery-days requirement.
 *
 * Order matters: admin gate first (CLAUDE.md §10 — never let an unprivileged
 * caller reach the audit log or a cache bust), then Zod parse (§4), then the
 * write, then invalidate the cached read so the storefront picks the change up
 * on the next request instead of after a TTL.
 */
import { revalidatePath, updateTag } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { STOREFRONT_SETTINGS_TAG } from "@/features/storefront/application/get-storefront-settings";
import { storefrontSettingsSchema } from "@/features/storefront/domain/storefront-settings";
import { saveStorefrontSettings } from "@/features/storefront/infrastructure/storefront-settings.repository";
import { logAudit, SINGLETON_ENTITY_ID } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

export type UpdateStorefrontSettingsState =
  | { status: "idle" }
  | { status: "success"; savedAt: number }
  | { status: "error"; message: string };

export async function updateStorefrontSettingsAction(
  _previous: UpdateStorefrontSettingsState,
  formData: FormData,
): Promise<UpdateStorefrontSettingsState> {
  const auth = await assertAdmin();
  if (!auth.ok) {
    return { status: "error", message: auth.error.message };
  }

  const parsed = storefrontSettingsSchema.safeParse({
    // Checkbox group → every checked weekday arrives under the same name.
    home_delivery_days: formData.getAll("home_delivery_days"),
    cargo_min_order_minor: formData.get("cargo_min_order_minor"),
    home_min_order_minor: formData.get("home_min_order_minor"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz ayar değeri.",
    };
  }

  const saved = await saveStorefrontSettings(parsed.data, auth.value.id);
  if (!saved.ok) {
    logger.error({ code: saved.error.code }, "storefront_settings_update_failed");
    return { status: "error", message: saved.error.message };
  }

  await logAudit({
    actor_id: auth.value.id,
    action: "storefront_settings.updated",
    entity_type: "storefront_settings",
    entity_id: SINGLETON_ENTITY_ID,
    after: {
      home_delivery_days: saved.value.homeDeliveryDays,
      cargo_min_order_minor: saved.value.cargoMinOrderMinor,
      home_min_order_minor: saved.value.homeMinOrderMinor,
    },
  });

  // The cached read is what the storefront actually looks at.
  updateTag(STOREFRONT_SETTINGS_TAG);
  revalidatePath("/magaza-ayarlari");
  revalidatePath("/odeme");
  revalidatePath("/");

  return { status: "success", savedAt: Date.now() };
}
