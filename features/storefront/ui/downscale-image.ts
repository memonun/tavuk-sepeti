/**
 * Shrink a picked photo in the browser before it is uploaded. A phone photo
 * is often 4000px wide and several MB; the showcase is at most ~1150px wide
 * (2300px on a sharp screen), so anything bigger is only upload time and a
 * risk of hitting the 5 MB limit.
 *
 * WEBP where the browser can encode it, JPEG otherwise: `toBlob` quietly
 * returns a PNG for a type it cannot write, and a 2400px PNG photo can be
 * larger than the original. `createImageBitmap` applies the photo's EXIF
 * rotation, so a portrait shot stays upright.
 */
const MAX_SIDE = 2400;
const QUALITY = 0.85;

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Tarayıcı fotoğrafı işleyemedi.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = await encode(canvas, "image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode(canvas, "image/jpeg");
  if (jpeg?.type === "image/jpeg") return jpeg;
  throw new Error("Tarayıcı fotoğrafı işleyemedi.");
}
