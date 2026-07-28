/**
 * Downscale + re-encode an image in the browser before upload: caps the long
 * edge and re-compresses to WEBP so storefront images load fast (CLAUDE.md §9)
 * and uploads stay well under the size limit. Best-effort — if the browser
 * can't decode/encode the file, the original is returned and the server-side
 * validation still applies.
 */
export async function compressImage(
  file: File,
  { maxDim = 1600, quality = 0.82 }: { maxDim?: number; quality?: number } = {},
): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/webp", quality);
  });
  return blob ?? file;
}
