import { cn } from "@/lib/utils";

/**
 * The pazar etiketi: the price, written the way a market stall writes it — a
 * cut tag with big numerals. It is the one loud element in the shop (see
 * `.shop-price-tag` in theme.css); everything around it stays quiet so the
 * first thing an older shopper's eye lands on is what the thing costs.
 */
export function PriceTag({
  amount,
  unit,
  prefix,
  className,
}: {
  /** Already formatted, e.g. "700,00 ₺". */
  amount: string;
  /** What the price buys, e.g. "kg" or "paket (15 adet)". */
  unit: string;
  /** Optional lead-in, e.g. "başlangıç" for a volume-discounted product. */
  prefix?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <p className={cn("shop-price-tag max-w-full flex-wrap", className)}>
      {prefix ? <span className="text-base font-semibold">{prefix}</span> : null}
      <span className="shop-money text-[1.625rem] leading-tight font-extrabold whitespace-nowrap">
        {amount}
      </span>
      <span className="text-base font-semibold">/ {unit}</span>
    </p>
  );
}
