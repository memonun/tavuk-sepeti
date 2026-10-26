import { formatTRY } from "@/shared/utils/money";

import { StruckPrice } from "@/features/storefront/ui/kit/struck-price";
import {
  fromPriceMinor,
  fromPriceSale,
  lineSale,
  lineTotalMinor,
} from "@/features/storefront/ui/line-pricing";

import type { Product } from "@/features/products/application/list-products";

/**
 * A line's total as the customer pays it, preceded by the struck-through
 * regular total when a sale lowers this line. Inline, so it inherits the
 * surrounding text size; `className` styles the paid amount.
 */
export function LineTotal({
  product,
  quantity,
  className,
}: {
  product: Product;
  quantity: number;
  className?: string | undefined;
}) {
  const sale = lineSale(product, quantity);
  return (
    <>
      {sale ? (
        <>
          <StruckPrice amount={formatTRY(sale.regularMinor)} />{" "}
        </>
      ) : null}
      <span className={className}>{formatTRY(lineTotalMinor(product, quantity))}</span>
    </>
  );
}

/** The card's "from" (per-unit at min qty) price, with the struck regular one on sale. */
export function FromPrice({
  product,
  className,
}: {
  product: Product;
  className?: string | undefined;
}) {
  const sale = fromPriceSale(product);
  return (
    <>
      {sale ? (
        <>
          <StruckPrice amount={formatTRY(sale.regularMinor)} />{" "}
        </>
      ) : null}
      <span className={className}>{formatTRY(fromPriceMinor(product))}</span>
    </>
  );
}
