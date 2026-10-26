"use server";

/**
 * Admin edit of the home page text: the slogan above the showcase and the
 * sentence on its photos. Edited in /vitrin, next to the photos it sits on.
 *
 * Same order as the shop rules action: admin gate, Zod parse, write, audit,
 * then invalidate the cached settings so the home page shows the new text on
 * the next request.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { STOREFRONT_SETTINGS_TAG } from "@/features/storefront/application/get-storefront-settings";
import type { UpdateStorefrontSettingsState } from "@/features/storefront/application/update-storefront-settings";
import { heroTextSchema } from "@/features/storefront/domain/storefront-settings";
import { saveHeroText } from "@/features/storefront/infrastructure/storefront-settings.repository";
import { logAudit, SINGLETON_ENTITY_ID } from "@/shared/audit/log-audit";
import { invalidateCacheTag } from "@/shared/cache/invalidate-tag";
import { logger } from "@/shared/logger";

export async function updateHeroTextAction(
  _previous: UpdateStorefrontSettingsState,
  formData: FormData,
): Promise<UpdateStorefrontSettingsState> {
  const auth = await assertAdmin();
  if (!auth.ok) {
    return { status: "error", message: auth.error.message };
  }

  const parsed = heroTextSchema.safeParse({
    hero_title: formData.get("hero_title"),
    hero_subtitle: formData.get("hero_subtitle"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz metin.",
    };
  }

  const saved = await saveHeroText(parsed.data, auth.value.id);
  if (!saved.ok) {
    logger.error({ code: saved.error.code }, "hero_text_update_failed");
    return { status: "error", message: saved.error.message };
  }

  await logAudit({
    actor_id: auth.value.id,
    action: "storefront_settings.hero_updated",
    entity_type: "storefront_settings",
    entity_id: SINGLETON_ENTITY_ID,
    after: {
      hero_title: saved.value.heroTitle,
      hero_subtitle: saved.value.heroSubtitle,
    },
  });

  invalidateCacheTag(STOREFRONT_SETTINGS_TAG);
  revalidatePath("/vitrin");
  revalidatePath("/");

  return { status: "success", savedAt: Date.now() };
}
