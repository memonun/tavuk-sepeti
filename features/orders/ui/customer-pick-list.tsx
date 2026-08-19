// features/orders/ui/customer-pick-list.tsx
"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { getCustomersMissingPrimaryAddressAction } from "@/features/customers/application/customer-price-actions";
import {
  listAllCustomerIds,
  listCustomersForPicker,
} from "@/features/customers/application/list-customers-for-picker";
import type { CustomerSearchHit } from "@/features/customers/application/search-customers-action";
import type { DraftBatch } from "@/features/orders/domain/draft-batch";
import type { Product } from "@/features/products/application/list-products";
import { usePersistentState } from "@/features/orders/ui/use-persistent-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTRPhone } from "@/shared/utils/phone";

const PAGE_SIZE = 25;

interface NewCustomerCreated {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  batch: DraftBatch;
  productsByKey: Map<string, Product>;
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (ids: ReadonlySet<string>) => void;
  // Opaque "+ Yeni Müşteri Ekle" trigger, composed by the page (app-route
  // layer) since this feature's UI may not import another feature's UI
  // directly. We only clone it with an onCreated callback at runtime — no
  // import of the underlying component is needed here.
  newCustomerSlot?: ReactNode;
}

export function CustomerPickList({
  batch,
  productsByKey,
  selectedIds,
  onSelectionChange,
  newCustomerSlot,
}: Props) {
  // Search + page persist too, so returning to the screen restores your spot.
  const [q, setQ] = usePersistentState("ts:bulk-order:picker-q:v1", "");
  const [page, setPage] = usePersistentState("ts:bulk-order:picker-page:v1", 1);
  const [rows, setRows] = useState<CustomerSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  // Range/keyboard selection state. Indices are into the CURRENT page's `rows`
  // (range gestures are page-scoped; "Tümünü seç" covers the whole filter).
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false); // mouse is down, a drag may be in progress
  const draggedRef = useRef(false); // pointer moved across rows → it's a drag, not a click
  const dragStartRef = useRef<number | null>(null);
  const dragBaseRef = useRef<ReadonlySet<string>>(new Set()); // selection snapshot at drag start

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
          // New page/search → page-local range indices no longer apply.
          setAnchorIndex(null);
          setActiveIndex(null);
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

  // End any drag when the mouse is released, even outside the list.
  useEffect(() => {
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Keep the keyboard-active row scrolled into view.
  useEffect(() => {
    if (activeIndex == null || !listRef.current) return;
    listRef.current
      .querySelector(`[data-row="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const toggleId = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  // Select rows [a..b] (inclusive, in `rows`) on top of `base`.
  const selectRange = (a: number, b: number, base: ReadonlySet<string>) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const next = new Set(base);
    for (let i = lo; i <= hi; i++) {
      const row = rows[i];
      if (row) next.add(row.id);
    }
    onSelectionChange(next);
  };

  const onRowMouseDown = (index: number, e: React.MouseEvent) => {
    listRef.current?.focus();
    draggedRef.current = false;
    if (e.shiftKey) return; // shift handled on click (range); don't start a drag
    draggingRef.current = true;
    dragStartRef.current = index;
    dragBaseRef.current = new Set(selectedIds);
  };

  const onRowMouseEnter = (index: number) => {
    if (!draggingRef.current || dragStartRef.current == null) return;
    draggedRef.current = true;
    setAnchorIndex(dragStartRef.current);
    setActiveIndex(index);
    selectRange(dragStartRef.current, index, dragBaseRef.current); // paint-select
  };

  const onRowClick = (index: number, id: string, e: React.MouseEvent) => {
    if (draggedRef.current) {
      draggedRef.current = false; // this "click" was the tail of a drag — swallow it
      return;
    }
    if (e.shiftKey && anchorIndex != null) {
      selectRange(anchorIndex, index, selectedIds); // shift+click range
      setActiveIndex(index);
      return;
    }
    toggleId(id); // plain click toggles (anchor moves here)
    setAnchorIndex(index);
    setActiveIndex(index);
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (rows.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const cur = activeIndex ?? -1;
      const nextIndex =
        e.key === "ArrowDown"
          ? Math.min(cur + 1, rows.length - 1)
          : Math.max((cur === -1 ? rows.length : cur) - 1, 0);
      setActiveIndex(nextIndex);
      if (e.shiftKey) {
        // Extend selection from the fixed anchor; grows the contiguous run.
        const next = new Set(selectedIds);
        const target = rows[nextIndex];
        if (target) next.add(target.id);
        const anchorRow = anchorIndex != null ? rows[anchorIndex] : undefined;
        if (anchorRow) next.add(anchorRow.id);
        onSelectionChange(next);
      } else {
        setAnchorIndex(nextIndex); // plain arrow just moves focus + anchor
      }
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (activeIndex != null) {
        const row = rows[activeIndex];
        if (row) {
          toggleId(row.id);
          setAnchorIndex(activeIndex);
        }
      }
    }
  };

  // A customer created from the sheet won't necessarily match the current
  // search/page — prepend it to the visible rows so it's immediately visible
  // and checked, rather than silently selected-but-invisible until searched.
  const handleCustomerCreated = (customer: NewCustomerCreated) => {
    setRows((prev) => [
      { id: customer.id, name: customer.name, phone: formatTRPhone(customer.phone), city: null },
      ...prev.filter((r) => r.id !== customer.id),
    ]);
    setTotal((t) => t + 1);
    onSelectionChange(new Set(selectedIds).add(customer.id));
  };

  const newCustomerAction = isValidElement(newCustomerSlot)
    ? cloneElement(
        newCustomerSlot as ReactElement<{ onCreated?: (c: NewCustomerCreated) => void }>,
        { onCreated: handleCustomerCreated },
      )
    : newCustomerSlot;

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

  // All filtered customers are selected → the select-all button becomes its own
  // "deselect all" toggle (no separate Temizle needed in that state).
  const allSelected = total > 0 && selectedIds.size >= total;

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
        {newCustomerAction}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={selectingAll}
          onClick={() => {
            if (allSelected) onSelectionChange(new Set());
            else void selectAllFiltered();
          }}
        >
          {allSelected ? `Tümünü kaldır (${selectedIds.size})` : "Tümünü seç"}
        </Button>
        {!allSelected && selectedIds.size > 0 && (
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

      <p className="px-0.5 text-[11px] text-muted-foreground">
        Hızlı seçim: tık = aç/kapat · shift+tık = aralık · sürükle = boya · ↑/↓ + shift = klavyeyle aralık · boşluk = aç/kapat
      </p>

      <div
        ref={listRef}
        role="listbox"
        aria-multiselectable
        tabIndex={0}
        onKeyDown={onListKeyDown}
        className="flex-1 select-none overflow-auto rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {loading && <p className="p-3 text-sm text-muted-foreground">Yükleniyor…</p>}
        {!loading &&
          rows.map((r, index) => {
            const selected = selectedIds.has(r.id);
            const active = index === activeIndex;
            return (
              <div
                key={r.id}
                data-row={index}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => onRowMouseDown(index, e)}
                onMouseEnter={() => onRowMouseEnter(index)}
                onClick={(e) => onRowClick(index, r.id, e)}
                className={`flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0 hover:bg-muted/50 ${
                  selected ? "bg-primary/10" : ""
                } ${active ? "ring-2 ring-inset ring-ring" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none size-4"
                />
                <span className="w-40 shrink-0 truncate font-medium">{r.name}</span>
                <Link
                  href={`/customers/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  title="Müşteri sayfasını yeni sekmede aç"
                  aria-label="Müşteri detayını yeni sekmede aç"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                </Link>
                {missing.has(r.id) && (
                  <Badge variant="destructive" className="text-[10px]">
                    ⚠ adres yok
                  </Badge>
                )}
                <span className="ml-auto">{chips(r.id)}</span>
              </div>
            );
          })}
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
