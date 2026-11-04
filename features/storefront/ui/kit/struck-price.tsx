import { cn } from "@/lib/utils";

/**
 * The struck-through regular price ("eski fiyat") shown beside a sale price.
 * `<del>` carries the meaning; the hidden lead-in makes screen readers say it,
 * since most don't announce `<del>` on their own. Muted, never the loud thing:
 * the eye should land on the price the customer actually pays.
 */
export function StruckPrice({
  amount,
  className,
}: {
  /** Already formatted, e.g. "150,00 ₺". */
  amount: string;
  className?: string | undefined;
}) {
  return (
    <del
      className={cn(
        "shop-money font-semibold whitespace-nowrap text-muted-foreground decoration-2",
        className,
      )}
    >
      <span className="sr-only">Eski fiyat: </span>
      {amount}
    </del>
  );
}

/** "%15 indirim" — the sale badge beside a struck price. */
export function SaleBadge({
  percent,
  className,
}: {
  percent: number;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-destructive px-2.5 py-0 text-base leading-6 font-bold whitespace-nowrap text-white",
        className,
      )}
    >
      %{percent} indirim
    </span>
  );
}
