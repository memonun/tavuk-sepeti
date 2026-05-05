/**
 * Typed errors emitted by the geocoding pipeline. Every failure mode is
 * explicit so call sites (UI, retry logic, logging) can branch on `code`
 * without parsing strings.
 *
 * Domain-layer errors — no fetch, no logger, no Supabase. Application layer
 * catches & logs.
 */
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";

import type { CoordinateAccuracy } from "@/shared/geo/coordinate";

interface DetailsBase {
  input: string;
}

export class GeocodingZeroResultsError extends AppError {
  constructor(details: DetailsBase) {
    super(ErrorCode.GEOCODING_ZERO_RESULTS, {
      message: "Bu adres için sonuç bulunamadı. Haritada manuel pin koy.",
      details,
    });
    this.name = "GeocodingZeroResultsError";
  }
}

interface LowAccuracyDetails extends DetailsBase {
  accuracy: CoordinateAccuracy;
  lat: number;
  lng: number;
}

export class GeocodingLowAccuracyError extends AppError {
  constructor(details: LowAccuracyDetails) {
    super(ErrorCode.GEOCODING_LOW_ACCURACY, {
      message: "Konum kesin değil. Lütfen pin'i onayla.",
      details,
    });
    this.name = "GeocodingLowAccuracyError";
  }
}

interface QuotaDetails {
  reason: "google_over_query_limit" | "daily_limit";
  /** Best-effort retry hint in seconds; absent for daily limit. */
  retryAfterSec?: number;
}

export class GeocodingQuotaExceededError extends AppError {
  constructor(details: QuotaDetails) {
    super(ErrorCode.QUOTA_EXCEEDED, {
      message:
        details.reason === "daily_limit"
          ? "Günlük geocoding limiti aşıldı."
          : "Google rate limit aşıldı, biraz bekleyin.",
      details,
    });
    this.name = "GeocodingQuotaExceededError";
  }
}

interface ApiErrorDetails {
  googleStatus: string;
  errorMessage?: string;
}

export class GeocodingApiError extends AppError {
  constructor(details: ApiErrorDetails) {
    super(ErrorCode.GEOCODING_FAILED, {
      message: "Geocoding servisine ulaşılamadı.",
      details,
    });
    this.name = "GeocodingApiError";
  }
}
