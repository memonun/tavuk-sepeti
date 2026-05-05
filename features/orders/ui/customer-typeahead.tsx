"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  searchCustomersAction,
  type CustomerSearchHit,
} from "@/features/customers/application/search-customers-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CustomerTypeaheadProps {
  /** Currently selected customer (for edit / pre-fill scenarios). */
  initial?: CustomerSearchHit | null;
  onChange: (customer: CustomerSearchHit | null) => void;
  error?: string | undefined;
}

export function CustomerTypeahead({
  initial = null,
  onChange,
  error,
}: CustomerTypeaheadProps) {
  const [selected, setSelected] = useState<CustomerSearchHit | null>(initial);
  const [text, setText] = useState("");
  const [results, setResults] = useState<CustomerSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      // Clearing the dropdown when the input goes below the search-trigger
      // length is a sync-with-external-input pattern; the React Compiler
      // rule fires false-positive here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const hits = await searchCustomersAction(text);
        setResults(hits);
        setOpen(true);
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
        <div>
          <p className="text-sm font-medium">{selected.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {selected.phone} {selected.city ? `· ${selected.city}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelected(null);
            setText("");
            setResults([]);
            onChange(null);
          }}
        >
          Değiştir
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          placeholder="İsim veya telefon ile ara…"
          className="pl-8"
        />
        {pending ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : text ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 px-0"
            onClick={() => {
              setText("");
              setResults([]);
              setOpen(false);
            }}
            aria-label="Temizle"
          >
            <X className="h-3 w-3" />
          </Button>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setSelected(hit);
                  setOpen(false);
                  onChange(hit);
                }}
              >
                <span className="font-medium">{hit.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {hit.phone} {hit.city ? `· ${hit.city}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : open && text.trim().length >= 2 && !pending ? (
        <p className="absolute z-10 mt-1 w-full rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-md">
          Sonuç bulunamadı.
        </p>
      ) : null}

      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
