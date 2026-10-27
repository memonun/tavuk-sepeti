"use server";

/**
 * Admin actions for the showcase photos (/vitrin): add, edit, remove, reorder.
 *
 * Every action: admin gate first (CLAUDE.md §10), then Zod parse (§4), then
 * the write, an audit row, and the cache invalidation that makes the home
 * page show the change on its next request.
 */
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { SHOWCASE_TAG } from "@/features/storefront/application/get-showcase";
import {
  MAX_SHOWCASE_SLIDES,
  addShowcaseSlideSchema,
  buildShowcaseImageKey,
  isBundledShowcaseImage,
  removeShowcaseSlideSchema,
  reorderShowcaseSlidesSchema,
  updateShowcaseSlideSchema,
} from "@/features/storefront/domain/showcase";
import {
  deleteShowcaseImageObject,
  deleteShowcaseSlide,
  fetchShowcaseSlidesAsAdmin,
  insertShowcaseSlide,
  reorderShowcaseSlides,
  updateShowcaseSlide,
  uploadShowcaseImageObject,
} from "@/features/storefront/infrastructure/showcase.repository";
import { logAudit, SINGLETON_ENTITY_ID } from "@/shared/audit/log-audit";
import { invalidateCacheTag } from "@/shared/cache/invalidate-tag";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import {
  UPLOAD_IMAGE_MAX_BYTES,
  imageExtForType,
  isAllowedUploadImageType,
} from "@/shared/utils/image-upload";

function refresh(): void {
  invalidateCacheTag(SHOWCASE_TAG);
  revalidatePath("/vitrin");
  revalidatePath("/");
}

/** Upload a photo and add it at the end of the showcase. */
export async function addShowcaseSlideAction(
  formData: FormData,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = addShowcaseSlideSchema.safeParse({
    image_alt: formData.get("image_alt"),
    focus_y: formData.get("focus_y"),
  });
  if (!parsed.success) {
    return err(new ValidationError({ message: parsed.error.issues[0]?.message ?? "Geçersiz istek." }));
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return err(new ValidationError({ message: "Fotoğraf bulunamadı." }));
  }
  const ext = imageExtForType(file.type);
  if (!ext || !isAllowedUploadImageType(file.type)) {
    return err(new ValidationError({ message: "Yalnızca JPEG, PNG veya WEBP yükleyin." }));
  }
  if (file.size > UPLOAD_IMAGE_MAX_BYTES) {
    return err(new ValidationError({ message: "Fotoğraf 5 MB'den küçük olmalı." }));
  }

  // The current list decides both the limit and the new photo's place.
  const current = await fetchShowcaseSlidesAsAdmin();
  if (!current.ok) return err(current.error);
  if (current.value.length >= MAX_SHOWCASE_SLIDES) {
    return err(
      new ValidationError({
        message: `Vitrinde en fazla ${MAX_SHOWCASE_SLIDES} fotoğraf olabilir. Yenisini eklemek için birini kaldırın.`,
      }),
    );
  }

  const objectKey = buildShowcaseImageKey(randomUUID().replace(/-/g, "").slice(0, 16), ext);
  const uploaded = await uploadShowcaseImageObject(
    objectKey,
    new Uint8Array(await file.arrayBuffer()),
    file.type,
  );
  if (!uploaded.ok) return err(uploaded.error);

  const inserted = await insertShowcaseSlide({
    image_path: objectKey,
    image_alt: parsed.data.image_alt,
    focus_y: parsed.data.focus_y,
    // Last place. A tie with a simultaneous upload is broken by created_at.
    sort_order: current.value.length + 1,
    created_by: auth.value.id,
  });
  if (!inserted.ok) {
    // Don't leave the uploaded file behind with no row pointing at it.
    await deleteShowcaseImageObject(objectKey);
    return err(inserted.error);
  }

  await logAudit({
    actor_id: auth.value.id,
    action: "showcase_slide.created",
    entity_type: "showcase_slide",
    entity_id: inserted.value.id,
    after: { image_path: objectKey, image_alt: parsed.data.image_alt, focus_y: parsed.data.focus_y },
  });

  refresh();
  return ok(undefined);
}

/** Change a photo's description or framing. */
export async function updateShowcaseSlideAction(raw: unknown): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateShowcaseSlideSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: parsed.error.issues[0]?.message ?? "Geçersiz istek." }));
  }

  const saved = await updateShowcaseSlide(parsed.data.id, {
    image_alt: parsed.data.image_alt,
    focus_y: parsed.data.focus_y,
  });
  if (!saved.ok) return err(saved.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "showcase_slide.updated",
    entity_type: "showcase_slide",
    entity_id: parsed.data.id,
    after: { image_alt: saved.value.imageAlt, focus_y: saved.value.focusY },
  });

  refresh();
  return ok(undefined);
}

/** Take a photo out of the showcase. The last photo cannot be removed. */
export async function removeShowcaseSlideAction(raw: unknown): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = removeShowcaseSlideSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: parsed.error.issues[0]?.message ?? "Geçersiz istek." }));
  }

  // An empty showcase would leave a blank frame on the home page.
  const current = await fetchShowcaseSlidesAsAdmin();
  if (!current.ok) return err(current.error);
  if (current.value.length <= 1) {
    return err(new ValidationError({ message: "Vitrinde en az bir fotoğraf kalmalı." }));
  }

  const removed = await deleteShowcaseSlide(parsed.data.id);
  if (!removed.ok) return err(removed.error);

  // Bundled photos are site files, not bucket objects: nothing to delete.
  if (!isBundledShowcaseImage(removed.value.imagePath)) {
    const cleaned = await deleteShowcaseImageObject(removed.value.imagePath);
    if (!cleaned.ok) {
      logger.warn({ objectKey: removed.value.imagePath }, "showcase_image_cleanup_failed");
    }
  }

  await logAudit({
    actor_id: auth.value.id,
    action: "showcase_slide.deleted",
    entity_type: "showcase_slide",
    entity_id: parsed.data.id,
    before: { image_path: removed.value.imagePath, image_alt: removed.value.imageAlt },
  });

  refresh();
  return ok(undefined);
}

/** Save a new order: `ids` is every photo, first to last. */
export async function reorderShowcaseSlidesAction(raw: unknown): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = reorderShowcaseSlidesSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: parsed.error.issues[0]?.message ?? "Geçersiz istek." }));
  }

  const saved = await reorderShowcaseSlides(parsed.data.ids);
  if (!saved.ok) return err(saved.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "showcase_slide.reordered",
    entity_type: "showcase_slide",
    // The order belongs to the showcase as a whole, not to one photo.
    entity_id: SINGLETON_ENTITY_ID,
    after: { order: parsed.data.ids },
  });

  refresh();
  return ok(undefined);
}
