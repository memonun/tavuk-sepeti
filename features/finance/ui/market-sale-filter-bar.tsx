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

import type { MarketLocation } from "@/features/finance/domain/market-location";

export function MarketSaleFilterBar({ locations }: { locations: MarketLocation[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const locationId = params.get("location_id") ?? "all";
  const locationItems: Record<string, string> = {
    all: "Tüm lokasyonlar",
    ...Object.fromEntries(locations.map((loc) => [loc.id, loc.name])),
  };
  const from = params.get("date_from") ?? "";
  const to = params.get("date_to") ?? "";

  const update = (next: URLSearchParams) => {
    next.delete("page");
    const search = next.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  };

  const setLocation = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("location_id");
    else next.set("location_id", value);
    update(next);
  };

  const setDate = (key: "date_from" | "date_to", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    update(next);
  };

  return (
    <div className="grid gap-3 border-b pb-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Pazar / Lokasyon</Label>
        <Select value={locationId} onValueChange={setLocation} disabled={pending} items={locationItems}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm lokasyonlar</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
  );
}
