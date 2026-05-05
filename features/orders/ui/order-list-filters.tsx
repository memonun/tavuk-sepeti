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
  delivered: "Teslim edildi",
  cancelled: "İptal",
};

export function OrderListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const status = params.get("status") ?? "all";
  const from = params.get("scheduled_from") ?? "";
  const to = params.get("scheduled_to") ?? "";

  const update = (next: URLSearchParams) => {
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

  const setDate = (key: "scheduled_from" | "scheduled_to", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    update(next);
  };

  return (
    <div className="grid gap-3 border-b pb-4 md:grid-cols-3">
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
        <Label className="text-xs">Teslim — başlangıç</Label>
        <Input
          type="date"
          value={from}
          disabled={pending}
          onChange={(e) => setDate("scheduled_from", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Teslim — bitiş</Label>
        <Input
          type="date"
          value={to}
          disabled={pending}
          onChange={(e) => setDate("scheduled_to", e.target.value)}
        />
      </div>
    </div>
  );
}
