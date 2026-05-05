import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";

export class WarehouseNotConfiguredError extends AppError {
  constructor() {
    super(ErrorCode.BUSINESS_RULE_VIOLATION, {
      message:
        "Depo koordinatları ayarlanmamış. .env'de WAREHOUSE_LAT ve WAREHOUSE_LNG'yi doldur.",
    });
    this.name = "WarehouseNotConfiguredError";
  }
}

export class NoConfirmedOrdersError extends AppError {
  constructor(date: string) {
    super(ErrorCode.NOT_FOUND, {
      message: "Bu gün için onaylı sipariş yok.",
      details: { date },
    });
    this.name = "NoConfirmedOrdersError";
  }
}

interface TooManyDetails {
  count: number;
  cap: number;
}

export class TooManyWaypointsError extends AppError {
  constructor(details: TooManyDetails) {
    super(ErrorCode.BUSINESS_RULE_VIOLATION, {
      message: `Tek seferde ${details.cap} duraktan fazlası optimize edilemez (${details.count} sipariş var). Faz 2 VRP solver bu limiti kaldıracak.`,
      details,
    });
    this.name = "TooManyWaypointsError";
  }
}

interface DirectionsApiDetails {
  googleStatus: string;
  errorMessage?: string;
}

export class DirectionsApiError extends AppError {
  constructor(details: DirectionsApiDetails) {
    super(ErrorCode.DIRECTIONS_FAILED, {
      message: "Rota servisine ulaşılamadı.",
      details,
    });
    this.name = "DirectionsApiError";
  }
}
