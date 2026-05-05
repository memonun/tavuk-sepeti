"use client";

import { Loader2, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RouteControlsProps {
  date: string;
  optimized: boolean;
  hasOrders: boolean;
}

export function RouteControls({
  date,
  optimized,
  hasOrders,
}: RouteControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setDate = (next: string) => {
    if (!next) return;
    const updated = new URLSearchParams(params.toString());
    updated.set("date", next);
    // Changing date drops the optimized flag — the next page load fetches
    // the new day's orders unoptimized first (no Google cost).
    updated.delete("optimize");
    startTransition(() =>
      router.replace(`${pathname}?${updated.toString()}`),
    );
  };

  const optimize = () => {
    const updated = new URLSearchParams(params.toString());
    updated.set("date", date);
    updated.set("optimize", "1");
    startTransition(() =>
      router.replace(`${pathname}?${updated.toString()}`),
    );
  };

  const reset = () => {
    const updated = new URLSearchParams(params.toString());
    updated.set("date", date);
    updated.delete("optimize");
    startTransition(() =>
      router.replace(`${pathname}?${updated.toString()}`),
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-3 border-b pb-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Tarih</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={pending}
        />
      </div>

      {optimized ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Optimizasyonu kaldır
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={optimize}
          disabled={pending || !hasOrders}
          className="gap-1.5"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Rotayı Optimize Et
        </Button>
      )}
    </div>
  );
}
