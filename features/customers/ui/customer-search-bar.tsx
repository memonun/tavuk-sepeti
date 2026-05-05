"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABEL: Record<string, string> = {
  all: "Tüm durumlar",
  active: "Aktif",
  inactive: "Pasif",
  blocked: "Engelli",
};

export function CustomerSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState(() => params.get("q") ?? "");

  // URL-update debounce.
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (text) next.set("q", text);
      else next.delete("q");
      next.delete("page"); // reset paging on a new search
      const search = next.toString();
      const url = search ? `${pathname}?${search}` : pathname;
      startTransition(() => router.replace(url));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const status = params.get("status") ?? "all";

  const setStatus = (next: string | null) => {
    if (next === null) return;
    const updated = new URLSearchParams(params.toString());
    if (next === "all") updated.delete("status");
    else updated.set("status", next);
    updated.delete("page");
    const search = updated.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[240px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="İsim, soyisim veya telefon ara…"
          className="pl-8"
          disabled={pending}
        />
        {text ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 px-0"
            onClick={() => setText("")}
            aria-label="Aramayı temizle"
          >
            <X className="h-3 w-3" />
          </Button>
        ) : null}
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
