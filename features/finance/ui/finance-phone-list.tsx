/**
 * Shared pieces of the Finans lists' phone layout. Below the `md` breakpoint a
 * table of 6–9 columns is unreadable, so each row becomes a card: the same
 * record, the same row actions, the same sort controls — only stacked. From
 * `md` up the original tables are shown unchanged.
 */
import { cn } from "@/lib/utils";

export const PHONE_CARD = "rounded-2xl border bg-card shadow-(--admin-shadow-sm)";

/** The table's sortable column headers, as a row of chips above the cards. */
export function PhoneSortRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 text-sm text-muted-foreground">Sırala</span>
      {children}
    </div>
  );
}

/** One card: `children` is the record, `footer` its status + row actions. */
export function PhoneCard({
  children,
  footer,
  className,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn(PHONE_CARD, className)}>
      <div className="flex flex-col gap-1 px-4 pt-3 pb-2.5">{children}</div>
      {footer ? (
        <div className="flex items-center justify-between gap-2 border-t py-1 pr-1.5 pl-4">
          {footer}
        </div>
      ) : null}
    </li>
  );
}

/** First line of a card: what it is on the left, how much on the right. */
export function PhoneCardHeading({
  title,
  amount,
}: {
  title: React.ReactNode;
  amount: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base leading-snug font-semibold [overflow-wrap:anywhere]">
        {title}
      </div>
      <div className="shrink-0 text-base font-semibold tabular-nums">{amount}</div>
    </div>
  );
}
