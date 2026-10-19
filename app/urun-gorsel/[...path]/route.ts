import { z } from "zod";

import { getProductImageFile } from "@/features/products/application/get-product-image-file";
import { logger, newCorrelationId } from "@/shared/logger";

const paramsSchema = z.object({
  path: z.array(z.string().min(1)).min(1).max(2),
});

type RouteProps = { params: Promise<{ path: string[] }> };

function noImage(status: 404 | 502): Response {
  return new Response(null, {
    status,
    // A missing image may be uploaded later; an outage should be retried.
    headers: { "Cache-Control": status === 404 ? "public, s-maxage=300" : "no-store" },
  });
}

/**
 * GET /urun-gorsel/<product key>/<id>.<ext>: a product image served from our
 * own domain, so JSON-LD, link previews and the Merchant Center feed name
 * apuhanciftligi.com instead of the Supabase host (productImageSiteUrl).
 *
 * The bytes come from the public Storage bucket and are cached at the CDN for
 * a day: object keys change whenever a photo is replaced, so a cached copy is
 * never stale, but a deleted photo still drops out within that day.
 */
export async function GET(_request: Request, { params }: RouteProps): Promise<Response> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return noImage(404);
  const imagePath = parsed.data.path.join("/");

  const result = await getProductImageFile(imagePath);
  if (!result.ok) {
    logger.error({ correlationId: newCorrelationId(), code: result.error.code, imagePath }, "product_image_route_failed");
    return noImage(502);
  }
  if (!result.value) return noImage(404);

  return new Response(result.value.body, {
    headers: {
      "Content-Type": result.value.contentType,
      "Content-Length": String(result.value.body.byteLength),
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
