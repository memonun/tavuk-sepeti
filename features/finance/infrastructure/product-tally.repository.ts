import "server-only";

/**
 * Reads the product_tally() RPC (supabase/migrations/20260912120000). Not
 * yet in the generated Database type, so the call is cast — same posture as
 * finance-reporting.repository.ts's other RPC calls.
 */
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { FinanceDateBasis } from "@/features/finance/domain/finance-summary";
import type { ProductTallyRpcRow } from "@/features/finance/domain/product-tally";

export async function fetchProductTallyRows(
  from: string,
  to: string,
  dateBasis: FinanceDateBasis,
): Promise<Result<ProductTallyRpcRow[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("product_tally", {
    p_from: from,
    p_to: to,
    p_date_basis: dateBasis,
  });

  if (error) {
    logger.error(
      { rpc: "product_tally", code: error.code, message: error.message },
      "product_tally_rpc_failed",
    );
    return err(new ExternalApiError({ message: "Ürün çetelesi alınamadı.", cause: error }));
  }

  return ok((data ?? []) as ProductTallyRpcRow[]);
}
