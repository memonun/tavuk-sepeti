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

const STATUS_LABEL: Record<string, string> = {
  all: "Tüm durumlar",
  pending: "Beklemede",
  confirmed: "Onaylı",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal",
};

const RANGE_LABEL: Record<string, string> = {
  all: "Tüm tarihler",
  today: "Bugün",
  this_week: "Bu hafta",
  this_month: "Bu ay",
  past: "Geçmiş",
  custom: "Özel…",
};

const VALID_RANGES = new Set(Object.keys(RANGE_LABEL));

export function OrderListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const status = params.get("status") ?? "all";
  const rawRange = params.get("range") ?? "all";
  const range = VALID_RANGES.has(rawRange) ? rawRange : "all";
  const from = params.get("scheduled_from") ?? "";
  const to = params.get("scheduled_to") ?? "";

  const update = (next: URLSearchParams) => {
    // A new filter resets pagination — the user almost never wants to land
    // on page 4 of a different result set.
    next.delete("page");
    const search = next.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname),
    );
  };

  const setStatus = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("status");
    else next.set("status", value);
    update(next);
  };

  const setRange = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("range");
    else next.set("range", value);
    // Switching off "Özel…" drops any stale custom dates so the resolver
    // uses the preset instead.
    if (value !== "custom") {
      next.delete("scheduled_from");
      next.delete("scheduled_to");
    }
    update(next);
  };

  const setDate = (key: "scheduled_from" | "scheduled_to", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Typing a custom date implies the user wants the custom range.
    next.set("range", "custom");
    update(next);
  };

  return (
    <div className="space-y-3 border-b pb-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Durum</Label>
          <Select value={status} onValueChange={setStatus} disabled={pending}>
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
          <Label className="text-xs">Tarih</Label>
          <Select value={range} onValueChange={setRange} disabled={pending}>
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
      </div>

      {range === "custom" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Başlangıç</Label>
            <Input
              type="date"
              value={from}
              disabled={pending}
              onChange={(e) => setDate("scheduled_from", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Bitiş</Label>
            <Input
              type="date"
              value={to}
              disabled={pending}
              onChange={(e) => setDate("scheduled_to", e.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
