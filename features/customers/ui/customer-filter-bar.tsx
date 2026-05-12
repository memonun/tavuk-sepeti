"use client";

/**
 * Customer table filter bar — search + four dropdowns, no column-header
 * filters (per design). Layout:
 *
 *   [ Ara… ✕ ] [ Durum ▾ ] [ Şehir ▾ ] [ Kanal ▾ ] [ Tip ▾ ] [ Segment ▾ ]   Temizle
 *
 * Search debounces URL updates (~300ms) so typing doesn't replay the
 * server fetch on every keystroke; dropdowns update immediately. Any
 * filter change resets pagination to page 1.
 *
 * "Temizle" only appears when at least one filter is active.
 */
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

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  all: "Tüm tipler",
  individual: "Birey",
  business: "İşletme",
  charity: "Vakıf",
  bazaar_vendor: "Pazar",
};

interface CustomerFilterBarProps {
  cities: readonly string[];
  tags: readonly string[];
  legacySegments: readonly string[];
}

// Which URL keys count as "filters" — used by the Clear button.
const FILTER_KEYS = ["q", "status", "city", "tag", "account_type", "legacy_segment"];

export function CustomerFilterBar({
  cities,
  tags,
  legacySegments,
}: CustomerFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState(() => params.get("q") ?? "");

  // Debounced search.
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (text) next.set("q", text);
      else next.delete("q");
      next.delete("page");
      const search = next.toString();
      const url = search ? `${pathname}?${search}` : pathname;
      startTransition(() => router.replace(url));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const status = params.get("status") ?? "all";
  const city = params.get("city") ?? "all";
  const tag = params.get("tag") ?? "all";
  const accountType = params.get("account_type") ?? "all";
  const legacySegment = params.get("legacy_segment") ?? "all";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    const search = next.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname),
    );
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    for (const key of FILTER_KEYS) next.delete(key);
    next.delete("page");
    setText("");
    const search = next.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname),
    );
  };

  const hasAnyFilter =
    text !== "" ||
    status !== "all" ||
    city !== "all" ||
    tag !== "all" ||
    accountType !== "all" ||
    legacySegment !== "all";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
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
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 px-0"
              onClick={() => setText("")}
              aria-label="Aramayı temizle"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        <FilterSelect
          value={status}
          onChange={(v) => setParam("status", v)}
          options={[
            { value: "all", label: STATUS_LABEL.all! },
            { value: "active", label: STATUS_LABEL.active! },
            { value: "inactive", label: STATUS_LABEL.inactive! },
            { value: "blocked", label: STATUS_LABEL.blocked! },
          ]}
          pending={pending}
          width="w-36"
        />

        <FilterSelect
          value={city}
          onChange={(v) => setParam("city", v)}
          options={[
            { value: "all", label: "Tüm şehirler" },
            ...cities.map((c) => ({ value: c, label: c })),
          ]}
          pending={pending}
          width="w-36"
          emptyHint={cities.length === 0}
        />

        <FilterSelect
          value={tag}
          onChange={(v) => setParam("tag", v)}
          options={[
            { value: "all", label: "Tüm kanallar" },
            ...tags.map((t) => ({ value: t, label: t })),
          ]}
          pending={pending}
          width="w-40"
          emptyHint={tags.length === 0}
        />

        <FilterSelect
          value={accountType}
          onChange={(v) => setParam("account_type", v)}
          options={[
            { value: "all", label: ACCOUNT_TYPE_LABEL.all! },
            { value: "individual", label: ACCOUNT_TYPE_LABEL.individual! },
            { value: "business", label: ACCOUNT_TYPE_LABEL.business! },
            { value: "charity", label: ACCOUNT_TYPE_LABEL.charity! },
            { value: "bazaar_vendor", label: ACCOUNT_TYPE_LABEL.bazaar_vendor! },
          ]}
          pending={pending}
          width="w-32"
        />

        <FilterSelect
          value={legacySegment}
          onChange={(v) => setParam("legacy_segment", v)}
          options={[
            { value: "all", label: "Tüm segmentler" },
            ...legacySegments.map((s) => ({ value: s, label: s })),
          ]}
          pending={pending}
          width="w-44"
          emptyHint={legacySegments.length === 0}
        />

        {hasAnyFilter ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={pending}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Filtreleri temizle
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  pending: boolean;
  width: string;
  /** When true, the trigger renders as disabled because there's nothing
   *  to filter by yet. */
  emptyHint?: boolean;
}

function FilterSelect({
  value,
  onChange,
  options,
  pending,
  width,
  emptyHint,
}: FilterSelectProps) {
  const disabled = pending || emptyHint === true;
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger className={width} disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
