/**
 * The home page showcase (vitrin): the photos that slide under the owner's
 * sentence. The owner manages them in the admin "Vitrin" page (/vitrin);
 * each photo is a `showcase_slides` row (migration 20261026211541).
 *
 * `imagePath` is one of two things, and nothing else (a CHECK constraint and
 * the schema below both enforce the shape):
 *   - a file the site ships, starting with "/" ("/brand/x.webp") — the three
 *     photos the showcase launched with;
 *   - an object key in the public `showcase-images` bucket ("ab12.webp") — a
 *     photo the owner uploaded.
 *
 * Pure and client-safe: no env, no I/O. The caller passes the Supabase URL.
 */
import { z } from "zod";

/** Storage bucket that holds uploaded showcase photos. */
export const SHOWCASE_IMAGE_BUCKET = "showcase-images";

/** A showcase is a few photos, not a gallery; each one is a swipe to reach. */
export const MAX_SHOWCASE_SLIDES = 8;

export const MAX_SHOWCASE_ALT_LENGTH = 200;

/** Same pattern as the `showcase_slides_image_path_shape` CHECK constraint. */
const SHOWCASE_IMAGE_PATH_PATTERN =
  /^(\/(brand|hakkimizda)\/[a-z0-9-]+\.webp|[A-Za-z0-9_-]{1,64}\.(jpg|png|webp))$/;

export interface ShowcaseSlide {
  readonly id: string;
  readonly imagePath: string;
  readonly imageAlt: string;
  /** Which part of the photo stays in frame vertically: 0 top … 100 bottom. */
  readonly focusY: number;
}

/**
 * The launch photos — what the storefront shows when the table cannot be
 * read. Same rows the migration seeds, so a database blip looks like nothing
 * happened (CLAUDE.md §1: degrade to the launch state, never to an empty box).
 */
export const DEFAULT_SHOWCASE_SLIDES: readonly ShowcaseSlide[] = [
  {
    id: "default-masa",
    imagePath: "/brand/apuhan-acilis-masa.webp",
    imageAlt:
      "Bahçede, Apuhan Çiftliği kara tahtası önünde kuru kayısı, badem ve dut dolu masa",
    focusY: 72,
  },
  {
    id: "default-tavuklar",
    imagePath: "/hakkimizda/tavuklar-acik-alan.webp",
    imageAlt: "Meyve ağaçlarıyla çevrili çayırda dolaşan kahverengi tavuklar, arkada dağlar",
    focusY: 62,
  },
  {
    id: "default-kayisi",
    imagePath: "/hakkimizda/kayisi-hazirligi.webp",
    imageAlt: "Bir kasanın içindeki kayısıların çekirdeklerinin elle ayrılması",
    focusY: 55,
  },
];

const imageAltSchema = z
  .string({ message: "Fotoğraf açıklaması gerekli." })
  .trim()
  .min(1, "Fotoğraf açıklaması boş olamaz.")
  .max(MAX_SHOWCASE_ALT_LENGTH, `Fotoğraf açıklaması en fazla ${MAX_SHOWCASE_ALT_LENGTH} karakter olabilir.`);

const focusYSchema = z.coerce
  .number({ message: "Odak değeri gerekli." })
  .int()
  .min(0)
  .max(100);

/** A row as Postgres returns it — parsed, never trusted (CLAUDE.md §3). */
export const showcaseSlideRowSchema = z.object({
  id: z.string().uuid(),
  image_path: z.string().regex(SHOWCASE_IMAGE_PATH_PATTERN),
  image_alt: imageAltSchema,
  focus_y: focusYSchema,
});

export type ShowcaseSlideRow = z.infer<typeof showcaseSlideRowSchema>;

export function toShowcaseSlide(row: ShowcaseSlideRow): ShowcaseSlide {
  return {
    id: row.id,
    imagePath: row.image_path,
    imageAlt: row.image_alt,
    focusY: row.focus_y,
  };
}

/** The non-file fields of an upload (the file is checked separately). */
export const addShowcaseSlideSchema = z.object({
  image_alt: imageAltSchema,
  focus_y: focusYSchema,
});

export const updateShowcaseSlideSchema = z.object({
  id: z.string().uuid("Geçersiz fotoğraf."),
  image_alt: imageAltSchema,
  focus_y: focusYSchema,
});

export const removeShowcaseSlideSchema = z.object({
  id: z.string().uuid("Geçersiz fotoğraf."),
});

/** The full new order, first to last. No duplicates: each photo has one place. */
export const reorderShowcaseSlidesSchema = z.object({
  ids: z
    .array(z.string().uuid("Geçersiz fotoğraf."))
    .min(1)
    .max(MAX_SHOWCASE_SLIDES)
    .refine((ids) => new Set(ids).size === ids.length, "Aynı fotoğraf iki kez sıralanamaz."),
});

/** True for a file the site ships (not stored in the bucket). */
export function isBundledShowcaseImage(imagePath: string): boolean {
  return imagePath.startsWith("/");
}

/** Object key for an uploaded photo; the random id gives every upload a fresh URL. */
export function buildShowcaseImageKey(id: string, ext: string): string {
  return `${id}.${ext}`;
}

/**
 * The address to load a slide's photo from. A bundled photo is served by the
 * site itself; an uploaded one from the public bucket. `supabaseUrl` is
 * NEXT_PUBLIC_SUPABASE_URL.
 */
export function showcaseImageSrc(imagePath: string, supabaseUrl: string): string {
  if (isBundledShowcaseImage(imagePath)) return imagePath;
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${SHOWCASE_IMAGE_BUCKET}/${imagePath}`;
}

/**
 * Move one photo a place earlier (-1) or later (+1) and return the full new
 * order. At either end the order comes back unchanged.
 */
export function moveSlide(ids: readonly string[], id: string, direction: -1 | 1): string[] {
  const order = [...ids];
  const from = order.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= order.length) return order;
  const moved = order[from];
  const other = order[to];
  if (moved === undefined || other === undefined) return order;
  order[from] = other;
  order[to] = moved;
  return order;
}
