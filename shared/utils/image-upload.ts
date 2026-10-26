/**
 * Rules for an image an admin uploads to a public Storage bucket (product
 * covers, showcase photos). Pure and client-safe: the upload widgets check a
 * picked file with these before sending it, and the server actions check it
 * again (never trust the client). The buckets' own `file_size_limit` and
 * `allowed_mime_types` mirror these values as a last backstop.
 */

/** Accepted upload types. */
export const UPLOAD_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type UploadImageMime = (typeof UPLOAD_IMAGE_ALLOWED_TYPES)[number];

/** Hard cap for an uploaded image (5 MB). */
export const UPLOAD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Type guard for an accepted image mime type. */
export function isAllowedUploadImageType(mime: string): mime is UploadImageMime {
  return (UPLOAD_IMAGE_ALLOWED_TYPES as readonly string[]).includes(mime);
}

/** File extension for a stored/uploaded image mime type, or null if unknown. */
export function imageExtForType(mime: string): "jpg" | "png" | "webp" | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}
