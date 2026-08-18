import { describe, expect, it } from "vitest";

import {
  SALES_LEGAL_ACCEPTANCE_DOCUMENTS,
  createSalesLegalAcceptance,
  getLegalDoc,
} from "@/features/storefront/domain/legal";

describe("sales legal acceptance", () => {
  it("records the two accepted document versions with the supplied timestamp", () => {
    expect(createSalesLegalAcceptance(new Date("2026-08-18T12:00:00.000Z"))).toEqual({
      accepted_at: "2026-08-18T12:00:00.000Z",
      documents: SALES_LEGAL_ACCEPTANCE_DOCUMENTS,
    });
  });

  it("exposes the new recurring-order terms page", () => {
    expect(getLegalDoc("duzenli-siparis-kosullari")?.title).toBe(
      "Düzenli Sipariş Koşulları",
    );
  });
});
