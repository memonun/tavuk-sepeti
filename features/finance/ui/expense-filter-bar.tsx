"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXPENSE_CATEGORY_OPTIONS } from "@/features/finance/domain/expense";

const STATUS_LABEL: Record<string, string> = {
  all: "Tüm durumlar",
  pending: "Ödeme Bekliyor",
  paid: "Ödendi",
};

const CATEGORY_LABEL: Record<string, string> = {
  all: "Tüm kategoriler",
  ...Object.fromEntries(EXPENSE_CATEGORY_OPTIONS.map((c) => [c, c])),
};

export function ExpenseFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "all";
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
    if (value === "all") next.delete("category");
    else next.set("category", value);
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
        <Select value={category} onValueChange={setCategory} disabled={pending} items={CATEGORY_LABEL}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm kategoriler</SelectItem>
            {EXPENSE_CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
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
