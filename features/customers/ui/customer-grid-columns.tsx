/**
 * Column definitions for the Customers DataGrid.
 *
 * Each editable column wires its display + edit + clipboard behavior to
 * the matching Zod schema in customer.schema. Adding a new editable
 * column means: (1) add the field to customerCellPatchSchemas, (2) add
 * a column entry here, (3) ensure the repository can write the field.
 *
 * Pinning defaults: name (left), actions (right) — the user's "asla
 * kapanmayan kenar divider" hissi.
 */
import { coordinateCellEditor } from "@/components/data-grid/cells/coordinate-cell";
import { dateCellEditor } from "@/components/data-grid/cells/date-cell";
import { readonlyCellEditor } from "@/components/data-grid/cells/readonly-cell";
import { selectCellEditor } from "@/components/data-grid/cells/select-cell";
import { textCellEditor } from "@/components/data-grid/cells/text-cell";
import { Badge } from "@/components/ui/badge";
import type { DataGridColumn } from "@/components/data-grid/data-grid-types";
import { CUSTOMER_ORIGIN_LABELS } from "@/features/customers/domain/customer";
import { customerCellPatchSchemas } from "@/features/customers/domain/customer.schema";
import { formatDate } from "@/shared/utils/date";
import { formatTRPhone } from "@/shared/utils/phone";

import type { CustomerListItem } from "@/features/customers/domain/customer";

import { z } from "zod";

const STATUS_OPTIONS = [
  { value: "active", label: "Aktif", badgeVariant: "default" as const },
  { value: "inactive", label: "Pasif", badgeVariant: "secondary" as const },
  { value: "blocked", label: "Engelli", badgeVariant: "destructive" as const },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: "individual", label: "Birey" },
  { value: "business", label: "İşletme" },
  { value: "charity", label: "Vakıf" },
  { value: "bazaar_vendor", label: "Pazar" },
];

const ORDER_TYPE_OPTIONS = [
  { value: "delivery", label: "Teslimat" },
  { value: "retail", label: "Perakende" },
  { value: "wholesale", label: "Toptan" },
  { value: "bazaar", label: "Pazar" },
];

export const CUSTOMER_COLUMN_LABELS: Readonly<Record<string, string>> = {
  first_name: "Ad",
  last_name: "Soyad",
  phone: "Telefon",
  email: "E-posta",
  city: "Şehir",
  coordinates: "Koordinat",
  tag: "Kanal",
  account_type: "Tip",
  order_type: "Sipariş Tipi",
  legacy_segment: "Segment",
  origin: "Kaynak",
  status: "Durum",
  created_at: "Eklenme",
  actions: "İşlem",
};

export function buildCustomerColumns(
  onOpenDetail: (id: string) => void,
): DataGridColumn<CustomerListItem>[] {
  return [
    {
      id: "first_name",
      accessorKey: "first_name",
      header: "Ad",
      size: 160,
      columnType: "text",
      defaultPin: "left",
      editable: true,
      editor: textCellEditor({
        schema: customerCellPatchSchemas.first_name as unknown as z.ZodType<string | null>,
      }) as never,
      cell: ({ getValue, row }) => {
        const v = getValue() as string | null;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(row.original.id);
            }}
            className="w-full text-left underline-offset-2 hover:underline"
          >
            {v || <span className="text-muted-foreground">—</span>}
          </button>
        );
      },
    },
    {
      id: "last_name",
      accessorKey: "last_name",
      header: "Soyad",
      size: 160,
      columnType: "text",
      editable: true,
      editor: textCellEditor({
        schema: customerCellPatchSchemas.last_name as unknown as z.ZodType<string | null>,
      }) as never,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span>{v}</span> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      id: "phone",
      accessorKey: "phone",
      header: "Telefon",
      size: 160,
      columnType: "phone",
      editable: true,
      editor: textCellEditor({
        schema: customerCellPatchSchemas.phone as unknown as z.ZodType<string | null>,
        variant: "mono",
        placeholder: "0532 123 45 67",
      }) as never,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? (
          <span className="font-mono text-xs">{formatTRPhone(v)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "email",
      accessorKey: "email",
      header: "E-posta",
      size: 200,
      columnType: "email",
      editable: true,
      editor: textCellEditor({
        schema: customerCellPatchSchemas.email as unknown as z.ZodType<string | null>,
      }) as never,
    },
    {
      id: "city",
      accessorKey: "city",
      header: "Şehir",
      size: 130,
      columnType: "text",
      editable: true,
      editor: textCellEditor({
        schema: customerCellPatchSchemas.city as unknown as z.ZodType<string | null>,
      }) as never,
    },
    {
      id: "coordinates",
      accessorFn: (row) =>
        row.lat != null && row.lng != null && !(row.lat === 0 && row.lng === 0)
          ? { lat: row.lat, lng: row.lng }
          : null,
      header: "Koordinat",
      size: 180,
      columnType: "text",
      enableSorting: false,
      editable: true,
      editor: coordinateCellEditor() as never,
      cell: ({ getValue }) => {
        const v = getValue() as { lat: number; lng: number } | null;
        return v ? (
          <span className="font-mono text-xs">{v.lat.toFixed(6)}, {v.lng.toFixed(6)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "tag",
      accessorKey: "tag",
      header: "Kanal",
      size: 130,
      columnType: "text",
      editable: true,
      editor: textCellEditor({
        schema: customerCellPatchSchemas.tag as unknown as z.ZodType<string | null>,
      }) as never,
    },
    {
      id: "account_type",
      accessorKey: "account_type",
      header: "Tip",
      size: 120,
      columnType: "select",
      editable: true,
      editor: selectCellEditor({
        schema: customerCellPatchSchemas.account_type as unknown as z.ZodType<string>,
        options: ACCOUNT_TYPE_OPTIONS,
      }) as never,
    },
    {
      id: "order_type",
      accessorKey: "order_type",
      header: "Sipariş Tipi",
      size: 130,
      columnType: "select",
      editable: true,
      editor: selectCellEditor({
        schema: customerCellPatchSchemas.order_type as unknown as z.ZodType<string>,
        options: ORDER_TYPE_OPTIONS,
      }) as never,
    },
    {
      id: "legacy_segment",
      accessorKey: "legacy_segment",
      header: "Segment",
      size: 140,
      columnType: "text",
      editable: true,
      editor: textCellEditor({
        schema: customerCellPatchSchemas.legacy_segment as unknown as z.ZodType<string | null>,
      }) as never,
    },
    {
      id: "origin",
      accessorKey: "origin",
      header: "Kaynak",
      size: 100,
      columnType: "select",
      // Read-only: origin is set once by whichever channel created the row and
      // the phone/email unique indexes are partitioned by it — flipping it could
      // collide a web row with a legacy one holding the same number.
      editable: false,
      cell: ({ row }) => {
        const origin = row.original.origin;
        return (
          <Badge
            variant={origin === "customer_web" ? "default" : "outline"}
            className="px-1.5 py-0 text-[11px] leading-tight"
          >
            {CUSTOMER_ORIGIN_LABELS[origin]}
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
      editor: selectCellEditor({
        schema: customerCellPatchSchemas.status as unknown as z.ZodType<string>,
        options: STATUS_OPTIONS,
      }) as never,
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Eklenme",
      size: 130,
      columnType: "datetime",
      editable: false,
      editor: readonlyCellEditor<Date>((value) => (
        <span className="text-xs text-muted-foreground">{formatDate(value)}</span>
      )) as never,
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(getValue() as Date)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      size: 64,
      defaultPin: "right",
      enableSorting: false,
      enableResizing: false,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onOpenDetail(row.original.id)}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          aria-label="Müşteri detayını aç"
        >
          Aç
        </button>
      ),
    },
  ];
}

// Use the date-cell editor for created_at so the grid's date import isn't
// dead code if we later add an editable date column. Re-exported so the
// columns config above can swap to it without a separate import.
export { dateCellEditor };
