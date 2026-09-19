/**
 * Ürün Çetelesi drill-down: the orders one product was sold (or gifted) in,
 * shown under the tally table. Server Component — everything (selected
 * product, sold/gift tab, page) lives in the URL, so a selection survives a
 * reload and can be shared, and the period filter above keeps applying.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_LABEL,
  type ProductOrderRow,
  type ProductOrdersKind,
  type ProductOrdersPage,
} from "@/features/finance/domain/product-tally-orders";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

/** Anchor the links jump to, so a click near the top of a long table lands on
 *  the panel instead of leaving it below the fold. */
export const PRODUCT_ORDERS_ANCHOR = "urun-siparisleri";

interface Props {
  productName: string;
  /** The product's own unit label (sold rows are quantities of this). */
  soldUnitLabel: string | null;
  kind: ProductOrdersKind;
  /** Which tabs have anything to show for this product in the period. */
  hasSold: boolean;
  hasGift: boolean;
  page: ProductOrdersPage;
  /** Builds a link to this same view with query overrides; `null` deletes a key. */
  hrefFor: (overrides: Record<string, string | null>) => string;
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2);
}

function quantityCell(row: ProductOrderRow, kind: ProductOrdersKind, soldUnit: string | null) {
  const unit = kind === "sold" ? soldUnit : row.gift_unit_label;
  return `${formatQty(row.quantity)}${unit ? ` ${unit}` : ""}`;
}

export function ProductTallyOrdersPanel({
  productName,
  soldUnitLabel,
  kind,
  hasSold,
  hasGift,
  page,
  hrefFor,
}: Props) {
  const tabs: Array<{ kind: ProductOrdersKind; label: string; enabled: boolean }> = [
    { kind: "sold", label: "Satılan", enabled: hasSold },
    { kind: "gift", label: "Hediye edilen", enabled: hasGift },
  ];

  return (
    <section
      id={PRODUCT_ORDERS_ANCHOR}
      aria-label={`${productName} siparişleri`}
      className="scroll-mt-4 space-y-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{productName} — siparişler</h3>
          <p className="text-xs text-muted-foreground">
            Seçili dönemdeki iptal edilmemiş siparişler · {page.total} sipariş
          </p>
        </div>
        <Link
          href={hrefFor({ product: null, kind: null, orders_page: null })}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Kapat
        </Link>
      </div>

      <div className="flex gap-1" role="tablist">
        {tabs.map((tab) => (
          <Link
            key={tab.kind}
            role="tab"
            aria-selected={tab.kind === kind}
            aria-disabled={!tab.enabled}
            href={hrefFor({ kind: tab.kind, orders_page: null })}
            className={cn(
              "rounded-md border px-3 py-1 text-sm transition-colors",
              tab.kind === kind
                ? "border-primary bg-secondary font-medium"
                : "text-muted-foreground hover:bg-muted",
              !tab.enabled && "pointer-events-none opacity-40",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {page.rows.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Bu dönemde bu ürünün {kind === "sold" ? "satıldığı" : "hediye edildiği"} sipariş yok.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sipariş</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Teslimat</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Miktar</TableHead>
                {kind === "sold" ? <TableHead className="text-right">Tutar</TableHead> : null}
                {kind === "gift" ? <TableHead>Not</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((row) => (
                <TableRow key={row.order_id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/orders/${row.order_id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.order_number}
                    </Link>
                  </TableCell>
                  <TableCell>{row.customer_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(row.scheduled_for)}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "delivered" ? "outline" : "secondary"}>
                      {ORDER_STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quantityCell(row, kind, soldUnitLabel)}
                  </TableCell>
                  {kind === "sold" ? (
                    <TableCell className="text-right tabular-nums">
                      {row.line_total_minor !== null ? formatTRY(row.line_total_minor) : "—"}
                    </TableCell>
                  ) : null}
                  {kind === "gift" ? (
                    <TableCell className="text-muted-foreground">{row.note ?? "—"}</TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {page.pageCount > 1 ? (
        <nav aria-label="Sayfalama" className="flex items-center justify-between text-sm">
          {page.page > 1 ? (
            <Link
              href={hrefFor({ orders_page: String(page.page - 1) })}
              className="underline-offset-4 hover:underline"
            >
              ← Önceki
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Sayfa {page.page} / {page.pageCount}
          </span>
          {page.page < page.pageCount ? (
            <Link
              href={hrefFor({ orders_page: String(page.page + 1) })}
              className="underline-offset-4 hover:underline"
            >
              Sonraki →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
