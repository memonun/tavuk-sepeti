"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createMarketLocationSchema,
  deleteMarketLocationSchema,
  setMarketLocationActiveSchema,
} from "@/features/finance/domain/market-location.schema";
import {
  createMarketLocation,
  deleteMarketLocation,
  setMarketLocationActive,
} from "@/features/finance/infrastructure/market-location.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

/** Called from the "+ yeni lokasyon" affordance in the market-sale form, so
 *  a third stall is a form submission, not a migration. */
export async function createMarketLocationAction(
  raw: unknown,
): Promise<Result<{ id: string; name: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createMarketLocationSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz lokasyon adı.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createMarketLocation(parsed.data.name);
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "market_location.created",
    entity_type: "market_location",
    entity_id: created.value,
    after: { name: parsed.data.name },
  });

  revalidatePath("/finans/pazar-satislari");
  return ok({ id: created.value, name: parsed.data.name });
}

export async function deleteMarketLocationAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteMarketLocationSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz lokasyon." }));
  }

  const deleted = await deleteMarketLocation(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "market_location.deleted",
    entity_type: "market_location",
    entity_id: parsed.data.id,
  });

  revalidatePath("/finans/pazar-satislari");
  return ok({ id: parsed.data.id });
}

export async function setMarketLocationActiveAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = setMarketLocationActiveSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz istek." }));
  }

  const updated = await setMarketLocationActive(parsed.data.id, parsed.data.active);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "market_location.updated",
    entity_type: "market_location",
    entity_id: parsed.data.id,
    after: { active: parsed.data.active },
  });

  revalidatePath("/finans/pazar-satislari");
  return ok({ id: parsed.data.id });
}
