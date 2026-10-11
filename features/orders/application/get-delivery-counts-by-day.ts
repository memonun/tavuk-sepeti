import "server-only";

/**
 * How many route deliveries each day of a range has — the orders feature's
 * public read for the Takvim page (features/calendar). Read-only; cancelled
 * orders and cargo shipments are not counted.
 */
import {
  fetchDeliveryCountsByDay,
  type DeliveryCountRow,
} from "@/features/orders/infrastructure/delivery-counts.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";
import { ymdDayDiff } from "@/shared/utils/date";

export type DeliveryCount = DeliveryCountRow;

/** Longest range one call may cover. */
const MAX_RANGE_DAYS = 92;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `from` and `to` are YYYY-MM-DD, both inclusive. */
export async function getDeliveryCountsByDay(
  from: string,
  to: string,
): Promise<Result<DeliveryCount[], AppError>> {
  if (!YMD_RE.test(from) || !YMD_RE.test(to) || to < from) {
    return err(new ValidationError({ message: "Geçersiz tarih aralığı." }));
  }
  if (ymdDayDiff(from, to) >= MAX_RANGE_DAYS) {
    return err(new ValidationError({ message: `Aralık en fazla ${MAX_RANGE_DAYS} gün olabilir.` }));
  }
  return fetchDeliveryCountsByDay(from, to);
}
