/**
 * Downloads a product image from a model-supplied URL, defensively.
 *
 *  - https only, public hosts only (see domain/remote-image.ts);
 *  - the hostname is resolved HERE and the socket is pinned to the vetted
 *    address, so a DNS answer that changes between "check" and "connect"
 *    (rebinding) cannot redirect the request into our network;
 *  - every redirect hop is re-validated the same way (max 3);
 *  - 10 s overall timeout, body capped at 5 MB while streaming;
 *  - the type comes from the magic number, never from Content-Type.
 */
import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

import {
  REMOTE_IMAGE_MAX_BYTES,
  REMOTE_IMAGE_MAX_REDIRECTS,
  REMOTE_IMAGE_TIMEOUT_MS,
  checkRemoteImageUrl,
  isPrivateAddress,
  sniffImageType,
  type RemoteImageType,
} from "@/features/mcp/domain/remote-image";
import { ValidationError, type AppError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export interface RemoteImage {
  readonly bytes: Uint8Array;
  readonly type: RemoteImageType;
}

const REFUSED = "Bu bağlantıdan görsel indirilemez. Herkese açık, doğrudan bir https görsel bağlantısı verin.";

function refuse(message: string, reason: string): Result<never, AppError> {
  logger.warn({ reason }, "mcp_remote_image_refused");
  return err(new ValidationError({ message }));
}

interface Hop {
  readonly status: number;
  readonly location: string | null;
  readonly body: Uint8Array | null;
  readonly tooLarge: boolean;
}

function fetchOnce(url: URL, address: string, family: 4 | 6, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        headers: { accept: "image/jpeg,image/png,image/webp", "user-agent": "apuhan-panel-connector/1.0" },
        // Pin the connection to the address we already vetted.
        lookup: (_host, _opts, cb) => cb(null, address, family),
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, body: null, tooLarge: false });
          return;
        }
        if (status !== 200) {
          res.resume();
          resolve({ status, location: null, body: null, tooLarge: false });
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > REMOTE_IMAGE_MAX_BYTES) {
          res.destroy();
          resolve({ status, location: null, body: null, tooLarge: true });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > REMOTE_IMAGE_MAX_BYTES) {
            res.destroy();
            resolve({ status, location: null, body: null, tooLarge: true });
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, location: null, body: new Uint8Array(Buffer.concat(chunks)), tooLarge: false }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function fetchRemoteImage(rawUrl: string): Promise<Result<RemoteImage, AppError>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    let current = rawUrl;
    for (let hop = 0; hop <= REMOTE_IMAGE_MAX_REDIRECTS; hop += 1) {
      const checked = checkRemoteImageUrl(current);
      if (!checked.ok) return refuse(REFUSED, checked.reason);

      const hostname = checked.url.hostname.replace(/^\[|\]$/g, "");
      const addresses = await dnsLookup(hostname, { all: true });
      // Every answer must be public: one private record is enough to refuse.
      if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
        return refuse(REFUSED, "private_address");
      }
      const target = addresses[0];
      if (!target) return refuse(REFUSED, "no_address");

      const result = await fetchOnce(checked.url, target.address, target.family === 6 ? 6 : 4, controller.signal);

      if (result.status >= 300 && result.status < 400) {
        if (!result.location) return refuse("Görsel bağlantısı yönlendirme hatası verdi.", "redirect_without_location");
        current = new URL(result.location, checked.url).toString();
        continue;
      }
      if (result.tooLarge) return refuse("Görsel 5 MB'den küçük olmalı.", "too_large");
      if (result.status !== 200 || !result.body) {
        return refuse(`Görsel indirilemedi (HTTP ${result.status}).`, `http_${result.status}`);
      }

      const type = sniffImageType(result.body);
      if (!type) return refuse("Yalnızca JPEG, PNG veya WEBP yükleyin.", "unsupported_type");
      return ok({ bytes: result.body, type });
    }
    return refuse("Görsel bağlantısı çok fazla yönlendirme yapıyor.", "too_many_redirects");
  } catch (cause) {
    logger.warn({ message: cause instanceof Error ? cause.message : String(cause) }, "mcp_remote_image_failed");
    return err(new ValidationError({ message: "Görsel indirilemedi (bağlantıya ulaşılamadı veya zaman aşımı)." }));
  } finally {
    clearTimeout(timer);
  }
}
