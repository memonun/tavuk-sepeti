/**
 * Column definitions for the Orders DataGrid.
 *
 * Mirrors the customers column config: each editable column wires display +
 * edit + clipboard behavior to the matching Zod schema in order.schema. The
 * readonly columns (order_number, customer, total, created_at) render links /
 * formatted money / dates and cannot be edited from the grid — orders are not
 * created or deleted here.
 *
 * `scheduled_for` is a YYYY-MM-DD calendar string (not a Date), so it uses the
 * text editor with the string schema rather than the Date-based date editor.
 */
import Link from "next/link";

import { currencyCellEditor } from "@/components/data-grid/cells/currency-cell";
import { selectCellEditor } from "@/components/data-grid/cells/select-cell";
import { textCellEditor } from "@/components/data-grid/cells/text-cell";
import { Badge } from "@/components/ui/badge";
import type { DataGridColumn } from "@/components/data-grid/data-grid-types";
import { orderCellPatchSchemas } from "@/features/orders/domain/order.schema";
import { orderStatusEditor } from "@/features/orders/ui/order-status-cell";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import {
  FULFILLMENT_CHANNEL_LABELS,
  type OrderListItem,
} from "@/features/orders/domain/order";

import { z } from "zod";

// Payment status is derived from the ledger (recorded payments), so the grid
// shows it read-only — record/settle payments in the order detail panel.
const PAYMENT_LABELS: Record<
  string,
  { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
  pending: { label: "Bekliyor", variant: "secondary" },
  partial: { label: "Kısmi", variant: "outline" },
  paid: { label: "Ödendi", variant: "default" },
  failed: { label: "Başarısız", variant: "destructive" },
  refunded: { label: "İade", variant: "outline" },
};

const TIME_SLOT_OPTIONS = [
  { value: "morning", label: "Sabah" },
  { value: "afternoon", label: "Öğlen" },
  { value: "evening", label: "Akşam" },
];

export const ORDER_COLUMN_LABELS: Readonly<Record<string, string>> = {
  order_number: "No",
  customer: "Müşteri",
  fulfillment_channel: "Kanal",
  status: "Durum",
  scheduled_for: "Teslim",
  time_slot: "Zaman",
  payment_status: "Ödeme",
  delivery_fee: "Teslim Ücreti",
  total: "Tutar",
  delivery_notes: "Not",
  created_at: "Oluşturma",
};

export function buildOrderColumns(
  onOpenDetail: (row: OrderListItem) => void,
): DataGridColumn<OrderListItem>[] {
  return [
    {
      id: "order_number",
      accessorKey: "order_number",
      header: "No",
      size: 150,
      columnType: "text",
      defaultPin: "left",
      editable: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(row.original);
            }}
            className="font-mono text-xs underline-offset-2 hover:underline"
          >
            {row.original.order_number}
          </button>
          {row.original.source === "recurring_generated" ? (
            <Badge variant="outline" className="px-1 py-0 text-[10px] leading-tight">
              Abonelik
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "customer",
      accessorKey: "customer_name",
      header: "Müşteri",
      size: 200,
      columnType: "person",
      editable: false,
      cell: ({ row }) => {
        const name = row.original.customer_name?.trim();
        return (
          <Link
            href={`/customers/${row.original.customer_id}`}
            className="text-sm underline-offset-2 hover:underline"
          >
            {name && name.length > 0 ? name : "(isimsiz)"}
          </Link>
        );
      },
    },
    {
      id: "fulfillment_channel",
      accessorKey: "fulfillment_channel",
      header: "Kanal",
      size: 100,
      columnType: "select",
      // Read-only: the channel is frozen at creation and derived from the items.
      // Changing it means changing what was ordered, which happens in the detail
      // panel's item editor — not by editing a cell.
      editable: false,
      cell: ({ row }) => {
        const channel = row.original.fulfillment_channel;
        return (
          <Badge
            variant={channel === "shipping" ? "outline" : "secondary"}
            className="px-1.5 py-0 text-[11px] leading-tight"
          >
            {FULFILLMENT_CHANNEL_LABELS[channel]}
          </Badge>
        );
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Durum",
      size: 130,
      columnType: "select",
      editable: true,
      editor: orderStatusEditor as never,
    },
    {
      id: "scheduled_for",
      accessorKey: "scheduled_for",
      header: "Teslim",
      size: 130,
      columnType: "date",
      editable: true,
      editor: textCellEditor({
        schema: orderCellPatchSchemas.scheduled_for as unknown as z.ZodType<string | null>,
        variant: "mono",
        placeholder: "2026-06-08",
      }) as never,
    },
    {
      id: "time_slot",
      accessorKey: "time_slot",
      header: "Zaman",
      size: 110,
      columnType: "select",
      editable: true,
      editor: selectCellEditor({
        schema: orderCellPatchSchemas.time_slot as unknown as z.ZodType<string>,
        options: TIME_SLOT_OPTIONS,
      }) as never,
    },
    {
      id: "payment_status",
      accessorKey: "payment_status",
      header: "Ödeme",
      size: 140,
      columnType: "text",
      editable: false,
      cell: ({ row }) => {
        const o = row.original;
        const meta = PAYMENT_LABELS[o.payment_status] ?? {
          label: o.payment_status,
          variant: "secondary" as const,
        };
        const balance = o.total_minor - o.amount_paid_minor;
        return (
          <div className="flex items-center gap-1.5">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {balance > 0 && o.amount_paid_minor > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                kalan {formatTRY(balance)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "delivery_fee",
      accessorKey: "delivery_fee_minor",
      header: "Teslim Ücreti",
      size: 120,
      columnType: "number",
      editable: true,
      editor: currencyCellEditor({
        schema: orderCellPatchSchemas.delivery_fee as unknown as z.ZodType<number>,
      }) as never,
    },
    {
      id: "total",
      accessorKey: "total_minor",
      header: "Tutar",
      size: 120,
      columnType: "number",
      editable: false,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs font-medium">
          {formatTRY(getValue() as number)}
        </span>
      ),
    },
    {
      id: "delivery_notes",
      accessorKey: "delivery_notes",
      header: "Not",
      size: 200,
      columnType: "text",
      editable: true,
      editor: textCellEditor({
        schema: orderCellPatchSchemas.delivery_notes as unknown as z.ZodType<string | null>,
      }) as never,
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Oluşturma",
      size: 130,
      columnType: "datetime",
      editable: false,
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(getValue() as Date)}
        </span>
      ),
    },
  ];
}
