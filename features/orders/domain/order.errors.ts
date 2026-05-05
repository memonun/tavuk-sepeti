import { AppError, InvalidTransitionError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";

import type { OrderStatus } from "@/features/orders/domain/order";

interface InvalidTransitionDetails {
  from: OrderStatus;
  to: OrderStatus;
  /** Why this transition wasn't allowed: not in graph, missing reason, etc. */
  rule: "not_allowed" | "missing_reason";
}

export class OrderInvalidTransitionError extends InvalidTransitionError {
  constructor(details: InvalidTransitionDetails) {
    super({
      message:
        details.rule === "missing_reason"
          ? "İptal için bir neden gerekli."
          : `Durum geçişi geçersiz: ${details.from} → ${details.to}.`,
      details,
    });
    this.name = "OrderInvalidTransitionError";
  }
}

interface QuantityStepDetails {
  product_key: string;
  quantity: number;
  step: number;
}

export class InvalidQuantityStepError extends AppError {
  constructor(details: QuantityStepDetails) {
    super(ErrorCode.BUSINESS_RULE_VIOLATION, {
      message: `${details.product_key} için miktar ${details.step} katı olmalı (${details.quantity} verildi).`,
      details,
    });
    this.name = "InvalidQuantityStepError";
  }
}
