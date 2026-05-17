"use client";

/**
 * DataGrid demo client component — mounts the grid with mock data and
 * a console-logging cell-commit handler so the editing path can be
 * exercised without a real backend.
 */
import { useMemo } from "react";

import { z } from "zod";

import { DataGrid } from "@/components/data-grid/data-grid";
import { selectCellEditor } from "@/components/data-grid/cells/select-cell";
import { textCellEditor } from "@/components/data-grid/cells/text-cell";
import type { DataGridColumn } from "@/components/data-grid/data-grid-types";
import { ok } from "@/shared/result";

interface DemoRow {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly city: string;
  readonly tag: string;
  readonly segment: string;
  readonly status: "active" | "inactive" | "blocked";
  readonly account: "individual" | "business" | "charity";
  readonly notes: string;
}

interface DemoPatch {
  readonly columnId: string;
  readonly value: unknown;
}

const TR_CITIES = [
  "İstanbul", "Ankara", "İzmir", "Bursa", "Adana", "Konya", "Antalya",
  "Gaziantep", "Mersin", "Diyarbakır",
];
const TAGS = ["instagram", "whatsapp", "telefon", "tavsiye", "diğer"];
const SEGMENTS = ["pazar", "kurumsal", "vakıf", "abone"];

function makeMockRows(count: number): DemoRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i + 1}`,
    name: `Müşteri ${i + 1}`,
    phone: `+9053212${(10000 + i).toString().slice(0, 5)}`,
    city: TR_CITIES[i % TR_CITIES.length]!,
    tag: TAGS[i % TAGS.length]!,
    segment: SEGMENTS[i % SEGMENTS.length]!,
    status: (["active", "inactive", "blocked"] as const)[i % 3]!,
    account: (["individual", "business", "charity"] as const)[i % 3]!,
    notes: i % 5 === 0 ? "Önemli müşteri" : "",
  }));
}

export function DataGridDemo() {
  const data = useMemo(() => makeMockRows(50), []);

  const columns = useMemo<DataGridColumn<DemoRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Müşteri",
        size: 220,
        defaultPin: "left",
        editable: true,
        editor: textCellEditor({
          schema: z.string().min(1, "İsim gerekli."),
        }) as never,
        cell: ({ getValue }) => (
          <span className="font-medium">{String(getValue() ?? "")}</span>
        ),
      },
      {
        id: "phone",
        accessorKey: "phone",
        header: "Telefon",
        size: 160,
        editable: true,
        editor: textCellEditor({
          schema: z.string().regex(/^\+90\d{10}$/, "+90 ile 10 hane."),
          variant: "mono",
        }) as never,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{String(getValue() ?? "")}</span>
        ),
      },
      {
        id: "city",
        accessorKey: "city",
        header: "Şehir",
        size: 140,
        editable: true,
        editor: selectCellEditor({
          schema: z.enum(TR_CITIES as unknown as [string, ...string[]]),
          options: TR_CITIES.map((c) => ({ value: c, label: c })),
        }) as never,
      },
      {
        id: "tag",
        accessorKey: "tag",
        header: "Kanal",
        size: 130,
        editable: true,
        editor: selectCellEditor({
          schema: z.enum(TAGS as unknown as [string, ...string[]]),
          options: TAGS.map((t) => ({ value: t, label: t })),
        }) as never,
      },
      {
        id: "segment",
        accessorKey: "segment",
        header: "Segment",
        size: 130,
        editable: true,
        editor: selectCellEditor({
          schema: z.enum(SEGMENTS as unknown as [string, ...string[]]),
          options: SEGMENTS.map((s) => ({ value: s, label: s })),
        }) as never,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Durum",
        size: 130,
        editable: true,
        editor: selectCellEditor({
          schema: z.enum(["active", "inactive", "blocked"]),
          options: [
            { value: "active", label: "Aktif", badgeVariant: "default" },
            { value: "inactive", label: "Pasif", badgeVariant: "secondary" },
            { value: "blocked", label: "Engelli", badgeVariant: "destructive" },
          ],
        }) as never,
      },
      {
        id: "account",
        accessorKey: "account",
        header: "Tip",
        size: 130,
        editable: true,
        editor: selectCellEditor({
          schema: z.enum(["individual", "business", "charity"]),
          options: [
            { value: "individual", label: "Birey" },
            { value: "business", label: "İşletme" },
            { value: "charity", label: "Vakıf" },
          ],
        }) as never,
      },
      {
        id: "notes",
        accessorKey: "notes",
        header: "Not",
        size: 280,
        editable: true,
        editor: textCellEditor({
          schema: z.string().max(2000),
          placeholder: "Not ekle…",
        }) as never,
      },
      {
        id: "actions",
        header: "İşlem",
        size: 80,
        defaultPin: "right",
        cell: () => <span className="text-xs text-muted-foreground">⋯</span>,
      },
    ],
    [],
  );

  return (
    <DataGrid<DemoRow, DemoPatch>
      data={data}
      columns={columns}
      rowId={(row) => row.id}
      tableId="dev-data-grid"
      totalCount={data.length}
      page={1}
      pageSize={50}
      mutations={{
        onCellCommit: async (rowId, patch) => {
          // No real backend — pretend it succeeded with the patch applied.
          await new Promise((r) => setTimeout(r, 250));
          const cur = data.find((r) => r.id === rowId);
          if (!cur) return ok(cur as never);
          return ok({ ...cur, [patch.columnId]: patch.value } as DemoRow);
        },
      }}
      buildPatch={(columnId, value) => ({ columnId, value })}
      renderRowExpand={(row) => (
        <div className="space-y-2">
          <div className="font-semibold">{row.name}</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>ID: {row.id}</span>
            <span>Telefon: {row.phone}</span>
            <span>Şehir: {row.city}</span>
            <span>Kanal: {row.tag}</span>
            <span>Segment: {row.segment}</span>
            <span>Tip: {row.account}</span>
          </div>
          {row.notes ? <p className="text-sm">{row.notes}</p> : null}
        </div>
      )}
    />
  );
}
