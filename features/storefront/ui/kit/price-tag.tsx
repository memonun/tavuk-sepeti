import { cn } from "@/lib/utils";

import { SaleBadge, StruckPrice } from "@/features/storefront/ui/kit/struck-price";

/**
 * The pazar etiketi: the price, written the way a market stall writes it — a
 * cut tag with big numerals. It is the one loud element in the shop (see
 * `.shop-price-tag` in theme.css); everything around it stays quiet so the
 * first thing an older shopper's eye lands on is what the thing costs.
 *
 * On sale, the line above the tag carries the struck-through regular price
 * and a "%X indirim" badge; the tag itself always shows what the customer
 * pays.
 */
export function PriceTag({
  amount,
  unit,
  prefix,
  reservePrefixLine = false,
  sale,
  className,
}: {
  /** Already formatted, e.g. "700,00 ₺". */
  amount: string;
  /** What the price buys, e.g. "kg" or "paket (15 adet)". */
  unit: string;
  /** Optional lead-in shown above the tag, e.g. "Başlangıç fiyatı" for a
   *  volume-discounted product. */
  prefix?: string | undefined;
  /** From `sm` up, keep the prefix line's height even when there is no
   *  prefix, so tags line up across a grid row of cards. */
  reservePrefixLine?: boolean | undefined;
  /** When on sale: the formatted regular price and the whole-percent saving. */
  sale?: { regularAmount: string; percent: number } | null | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex max-w-full flex-col items-start gap-1", className)}>
      {/* Above the tag, not inside it: inside, "başlangıç 125,00 ₺ / paket
          (15 adet)" no longer fitted one line and the tag broke into a
          two-line block. */}
      {prefix || sale ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-muted-foreground">
          {prefix ? <span>{prefix}</span> : null}
          {sale ? (
            <>
              <StruckPrice amount={sale.regularAmount} />
              <SaleBadge percent={sale.percent} />
            </>
          ) : null}
        </p>
      ) : reservePrefixLine ? (
        <p aria-hidden className="invisible hidden text-base font-semibold sm:block">
          {"\u00a0"}
        </p>
      ) : null}
      <p className="shop-price-tag max-w-full flex-wrap">
        <span className="shop-money text-[1.625rem] leading-tight font-extrabold whitespace-nowrap">
          {amount}
        </span>
        <span className="text-base font-semibold">/ {unit}</span>
      </p>
    </div>
  );
}
