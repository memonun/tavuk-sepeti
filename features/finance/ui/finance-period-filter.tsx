"use client";

/**
 * Finans Özeti period filter — copies the shape of
 * features/orders/ui/order-list-filters.tsx (URL-driven Select +
 * conditional custom-date inputs via useTransition), plus a Teslimat
 * tarihi / Sipariş tarihi toggle specific to Finans.
 */
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

const RANGE_LABEL: Record<string, string> = {
  today: "Bugün",
  this_week: "Bu Hafta",
  this_month: "Bu Ay",
  this_year: "Bu Yıl",
  custom: "Özel Tarih",
};

const DATE_BASIS_LABEL: Record<string, string> = {
  scheduled_for: "Teslimat tarihi",
  created_at: "Sipariş tarihi",
};

const VALID_RANGES = new Set(Object.keys(RANGE_LABEL));

export function FinancePeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const rawRange = params.get("range") ?? "this_month";
  const range = VALID_RANGES.has(rawRange) ? rawRange : "this_month";
  const dateBasis = params.get("date_basis") === "created_at" ? "created_at" : "scheduled_for";
  const from = params.get("date_from") ?? "";
  const to = params.get("date_to") ?? "";

  const update = (next: URLSearchParams) => {
    const search = next.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  };

  const setRange = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(params.toString());
    next.set("range", value);
    if (value !== "custom") {
      next.delete("date_from");
      next.delete("date_to");
    }
    update(next);
  };

  const setDateBasis = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(params.toString());
    if (value === "scheduled_for") next.delete("date_basis");
    else next.set("date_basis", value);
    update(next);
  };

  const setDate = (key: "date_from" | "date_to", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("range", "custom");
    update(next);
  };

  return (
    <div className="space-y-3 border-b pb-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Dönem</Label>
          <Select value={range} onValueChange={setRange} disabled={pending} items={RANGE_LABEL}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RANGE_LABEL).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Tarih baz alma</Label>
          <Select value={dateBasis} onValueChange={setDateBasis} disabled={pending} items={DATE_BASIS_LABEL}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DATE_BASIS_LABEL).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {range === "custom" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Başlangıç</Label>
            <Input
              type="date"
              value={from}
              disabled={pending}
              onChange={(e) => setDate("date_from", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Bitiş</Label>
            <Input
              type="date"
              value={to}
              disabled={pending}
              onChange={(e) => setDate("date_to", e.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
