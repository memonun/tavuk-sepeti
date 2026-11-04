import "server-only";

/**
 * Read / write the showcase photos (`showcase_slides`, migration
 * 20261026211541) and their files in the public `showcase-images` bucket.
 *
 * Same two-client split as storefront-settings.repository.ts:
 *   - the storefront READ uses the service-role client, because it runs inside
 *     `unstable_cache`, where cookies are off-limits. The rows are what the
 *     home page shows every visitor, so bypassing RLS for them leaks nothing.
 *   - every WRITE uses the cookie-bound client, so the admin-only RLS policy
 *     backs up `assertAdmin()` at the action boundary. Storage writes use the
 *     service role (the bucket has no write policy), after that same check.
 *
 * Every row is parsed with the domain schema (CLAUDE.md §3).
 */
import {
  SHOWCASE_IMAGE_BUCKET,
  showcaseSlideRowSchema,
  toShowcaseSlide,
  type ShowcaseSlide,
} from "@/features/storefront/domain/showcase";
import { AppError, ExternalApiError, ValidationError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const TABLE = "showcase_slides";
const COLUMNS = "id, image_path, image_alt, focus_y";

/**
 * `showcase_slides` post-dates the generated `Database` type; same documented
 * cast as storefront-settings.repository.ts until the next `pnpm db:types`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args: object) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Parse rows one by one: a single bad row is dropped (and logged), not the showcase. */
function parseRows(rows: unknown): ShowcaseSlide[] {
  if (!Array.isArray(rows)) return [];
  const slides: ShowcaseSlide[] = [];
  for (const row of rows) {
    const parsed = showcaseSlideRowSchema.safeParse(row);
    if (parsed.success) {
      slides.push(toShowcaseSlide(parsed.data));
    } else {
      logger.error(
        { issues: parsed.error.issues.map((i) => i.path.join(".")) },
        "showcase_slide_row_invalid",
      );
    }
  }
  return slides;
}

async function selectSlides(client: LooseClient): Promise<Result<ShowcaseSlide[], AppError>> {
  const { data, error } = await client
    .from(TABLE)
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    logger.warn({ code: error.code, message: error.message }, "showcase_slides_read_failed");
    return err(
      new AppError(ErrorCode.DATABASE_ERROR, { message: "Vitrin fotoğrafları okunamadı.", cause: error }),
    );
  }
  return ok(parseRows(data));
}

/** The storefront read (service role, cache-safe). */
export async function fetchShowcaseSlides(): Promise<Result<ShowcaseSlide[], AppError>> {
  return selectSlides(getSupabaseAdminClient() as unknown as LooseClient);
}

/** The admin page read (cookie-bound; RLS lets only an admin see rows). */
export async function fetchShowcaseSlidesAsAdmin(): Promise<Result<ShowcaseSlide[], AppError>> {
  return selectSlides((await createSupabaseServerClient()) as unknown as LooseClient);
}

export async function insertShowcaseSlide(values: {
  image_path: string;
  image_alt: string;
  focus_y: number;
  sort_order: number;
  created_by: string;
}): Promise<Result<ShowcaseSlide, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase.from(TABLE).insert(values).select(COLUMNS).maybeSingle();
  if (error || !data) {
    logger.error({ code: error?.code, message: error?.message }, "showcase_slide_insert_failed");
    return err(new AppError(ErrorCode.DATABASE_ERROR, { message: "Fotoğraf vitrine eklenemedi.", cause: error }));
  }
  const [slide] = parseRows([data]);
  if (!slide) {
    return err(new AppError(ErrorCode.DATABASE_ERROR, { message: "Fotoğraf eklendi ancak geri okunamadı." }));
  }
  return ok(slide);
}

export async function updateShowcaseSlide(
  id: string,
  values: { image_alt: string; focus_y: number },
): Promise<Result<ShowcaseSlide, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase
    .from(TABLE)
    .update(values)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    logger.error({ id, code: error.code, message: error.message }, "showcase_slide_update_failed");
    return err(new AppError(ErrorCode.DATABASE_ERROR, { message: "Fotoğraf güncellenemedi.", cause: error }));
  }
  const [slide] = parseRows(data ? [data] : []);
  if (!slide) {
    // No row updated → RLS refused it, or the photo was already removed.
    return err(new ValidationError({ message: "Fotoğraf bulunamadı veya bu işlem için yetkiniz yok." }));
  }
  return ok(slide);
}

/** Delete one row and return it, so the caller can clean up its file. */
export async function deleteShowcaseSlide(id: string): Promise<Result<ShowcaseSlide, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase.from(TABLE).delete().eq("id", id).select(COLUMNS).maybeSingle();
  if (error) {
    logger.error({ id, code: error.code, message: error.message }, "showcase_slide_delete_failed");
    return err(new AppError(ErrorCode.DATABASE_ERROR, { message: "Fotoğraf kaldırılamadı.", cause: error }));
  }
  const [slide] = parseRows(data ? [data] : []);
  if (!slide) {
    return err(new ValidationError({ message: "Fotoğraf bulunamadı veya bu işlem için yetkiniz yok." }));
  }
  return ok(slide);
}

/** Write the whole order in one statement (`reorder_showcase_slides`). */
export async function reorderShowcaseSlides(ids: readonly string[]): Promise<Result<void, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { error } = await supabase.rpc("reorder_showcase_slides", { p_ids: ids });
  if (error) {
    logger.error({ code: error.code, message: error.message }, "showcase_slides_reorder_failed");
    return err(new AppError(ErrorCode.DATABASE_ERROR, { message: "Sıralama kaydedilemedi.", cause: error }));
  }
  return ok(undefined);
}

export async function uploadShowcaseImageObject(
  objectKey: string,
  body: Uint8Array,
  contentType: string,
): Promise<Result<void, ExternalApiError>> {
  const { error } = await getSupabaseAdminClient()
    .storage.from(SHOWCASE_IMAGE_BUCKET)
    .upload(objectKey, body, { contentType, upsert: false });
  if (error) {
    logger.error({ objectKey, message: error.message }, "upload_showcase_image_failed");
    return err(new ExternalApiError({ message: "Fotoğraf yüklenemedi.", cause: error }));
  }
  return ok(undefined);
}

/** Best-effort removal of an uploaded file (after a delete or a failed insert). */
export async function deleteShowcaseImageObject(
  objectKey: string,
): Promise<Result<void, ExternalApiError>> {
  const { error } = await getSupabaseAdminClient().storage.from(SHOWCASE_IMAGE_BUCKET).remove([objectKey]);
  if (error) {
    logger.warn({ objectKey, message: error.message }, "delete_showcase_image_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
