// features/orders/ui/customer-pick-list.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import { getCustomersMissingPrimaryAddressAction } from "@/features/customers/application/customer-price-actions";
import {
  listAllCustomerIds,
  listCustomersForPicker,
} from "@/features/customers/application/list-customers-for-picker";
import type { CustomerSearchHit } from "@/features/customers/application/search-customers-action";
import type { DraftBatch } from "@/features/orders/domain/draft-batch";
import type { Product } from "@/features/products/application/list-products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 25;

interface Props {
  batch: DraftBatch;
  productsByKey: Map<string, Product>;
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (ids: ReadonlySet<string>) => void;
}

export function CustomerPickList({
  batch,
  productsByKey,
  selectedIds,
  onSelectionChange,
}: Props) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  // Debounced fetch on q/page change.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        setLoading(true);
        try {
          const res = await listCustomersForPicker(q.trim(), page, PAGE_SIZE);
          if (cancelled) return;
          setRows(res.items);
          setTotal(res.total);
          const miss = await getCustomersMissingPrimaryAddressAction(
            res.items.map((r) => r.id),
          );
          if (!cancelled) setMissing(new Set(miss));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, page]);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  };

  const selectAllFiltered = async () => {
    if (selectingAll) return;
    setSelectingAll(true);
    try {
      const ids = await listAllCustomerIds(q.trim());
      onSelectionChange(new Set(ids));
    } finally {
      setSelectingAll(false);
    }
  };

  const chips = (id: string) => {
    const lines = batch.assignments[id] ?? [];
    if (lines.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {lines.map((l) => {
          const p = productsByKey.get(l.product_key);
          return (
            <Badge key={l.product_key} variant="secondary" className="text-[10px]">
              {(p?.display_name ?? l.product_key)} ×{l.quantity}
            </Badge>
          );
        })}
      </span>
    );
  };

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Müşteri ara (isim / telefon)…"
          className="h-8"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={selectingAll}
          onClick={() => void selectAllFiltered()}
        >
          Tümünü seç
        </Button>
        {selectedIds.size > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange(new Set())}
          >
            Temizle ({selectedIds.size})
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto rounded-md border">
        {loading && <p className="p-3 text-sm text-muted-foreground">Yükleniyor…</p>}
        {!loading &&
          rows.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
                className="size-4"
              />
              <span className="w-40 shrink-0 truncate font-medium">{r.name}</span>
              {missing.has(r.id) && (
                <Badge variant="destructive" className="text-[10px]">
                  ⚠ adres yok
                </Badge>
              )}
              <span className="ml-auto">{chips(r.id)}</span>
            </label>
          ))}
        {!loading && rows.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">Sonuç yok.</p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total} müşteri • {selectedIds.size} seçili
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </Button>
          {page}/{pageCount}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </Button>
        </span>
      </div>
    </div>
  );
}
