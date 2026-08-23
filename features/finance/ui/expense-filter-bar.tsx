"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCategoryPath } from "@/features/finance/domain/expense-category";

import type { ExpenseCategoryNode } from "@/features/finance/domain/expense-category";

const STATUS_LABEL: Record<string, string> = {
  all: "Tüm durumlar",
  pending: "Ödeme Bekliyor",
  paid: "Ödendi",
};

export function ExpenseFilterBar({
  categories,
}: {
  /** Full tree (incl. archived) — a filter needs to find expenses recorded
   *  under a since-archived category, unlike the create form. */
  categories: readonly ExpenseCategoryNode[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = params.get("q") ?? "";
  const categoryId = params.get("category_id") ?? "all";
  const status = params.get("payment_status") ?? "all";
  const from = params.get("date_from") ?? "";
  const to = params.get("date_to") ?? "";

  const update = (next: URLSearchParams) => {
    next.delete("page");
    const search = next.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  };

  const setQ = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("q", value);
    else next.delete("q");
    update(next);
  };

  const setCategory = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("category_id");
    else next.set("category_id", value);
    update(next);
  };

  const setStatus = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("payment_status");
    else next.set("payment_status", value);
    update(next);
  };

  const setDate = (key: "date_from" | "date_to", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    update(next);
  };

  const categoryItems: Record<string, string> = { all: "Tüm kategoriler" };
  for (const parent of categories) {
    categoryItems[parent.id] = parent.children.length > 0 ? `${parent.name} (tümü)` : parent.name;
    for (const child of parent.children) {
      categoryItems[child.id] = formatCategoryPath(child.name, parent.name);
    }
  }

  return (
    <div className="grid gap-3 border-b pb-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Ara</Label>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Açıklama, firma, not…"
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Kategori</Label>
        <Select value={categoryId} onValueChange={setCategory} disabled={pending} items={categoryItems}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm kategoriler</SelectItem>
            {categories.map((parent) => (
              <SelectGroup key={parent.id}>
                {parent.children.length > 0 ? (
                  <>
                    {/* Selecting the parent includes every child (spec §19) —
                        the create form never offers this option, but a
                        filter legitimately wants "all Üretim Giderleri". */}
                    <SelectItem value={parent.id}>{parent.name} (tümü)</SelectItem>
                    {parent.children.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {formatCategoryPath(child.name, parent.name)}
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <SelectItem value={parent.id}>{parent.name}</SelectItem>
                )}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Ödeme Durumu</Label>
        <Select value={status} onValueChange={setStatus} disabled={pending} items={STATUS_LABEL}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Tarih aralığı</Label>
        <div className="flex gap-2">
          <Input
            type="date"
            value={from}
            disabled={pending}
            onChange={(e) => setDate("date_from", e.target.value)}
          />
          <Input
            type="date"
            value={to}
            disabled={pending}
            onChange={(e) => setDate("date_to", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
