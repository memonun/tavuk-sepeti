"use client";

import { ALargeSmall } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
  TEXT_SIZE_COOKIE,
  TEXT_SIZE_LABELS,
  TEXT_SIZES,
  type TextSize,
  parseTextSize,
} from "@/app/(admin)/_components/text-size";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** The "A" each choice is drawn with — a preview of what the choice does. */
const PREVIEW_CLASS: Record<TextSize, string> = {
  normal: "text-sm",
  large: "text-base",
  xlarge: "text-lg",
};

interface TextSizeContextValue {
  readonly size: TextSize;
  readonly setSize: (next: TextSize) => void;
}

const TextSizeContext = createContext<TextSizeContextValue | null>(null);

function useTextSize(): TextSizeContextValue {
  const value = useContext(TextSizeContext);
  if (!value) throw new Error("useTextSize must be used inside <TextSizeProvider>");
  return value;
}

/**
 * Holds the chosen size and marks the panel with it. The attribute is what
 * theme.css keys the root font size on (`:root:has([data-admin-text-size=…])`),
 * so it also reaches the sheets and menus portalled to <body>. `contents` keeps
 * the wrapper out of the layout.
 */
export function TextSizeProvider({
  initialSize,
  children,
}: {
  initialSize: TextSize;
  children: React.ReactNode;
}) {
  const [size, setSizeState] = useState<TextSize>(initialSize);

  const setSize = useCallback((next: TextSize) => {
    setSizeState(next);
    document.cookie = `${TEXT_SIZE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }, []);

  const value = useMemo(() => ({ size, setSize }), [size, setSize]);

  return (
    <TextSizeContext.Provider value={value}>
      <div data-admin-text-size={size} className="contents">
        {children}
      </div>
    </TextSizeContext.Provider>
  );
}

/** Phone menu row: three thumb-sized buttons, each showing its own size. */
export function TextSizeRow() {
  const { size, setSize } = useTextSize();

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="text-base font-medium">Yazı boyutu</span>
      <div role="group" aria-label="Yazı boyutu" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {TEXT_SIZES.map((option) => {
          const selected = size === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => setSize(option)}
              className={cn(
                "admin-tab flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1",
                selected ? "bg-card text-foreground shadow-(--admin-shadow-sm)" : "text-muted-foreground",
              )}
            >
              <span aria-hidden className={cn("leading-none font-semibold", PREVIEW_CLASS[option])}>
                A
              </span>
              <span className="truncate text-sm font-medium">{TEXT_SIZE_LABELS[option]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Desktop sidebar footer: same three choices behind one icon button. */
export function TextSizeMenu() {
  const { size, setSize } = useTextSize();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" aria-label="Yazı boyutu" title="Yazı boyutu" />}
      >
        <ALargeSmall className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Yazı boyutu</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={size} onValueChange={(next) => setSize(parseTextSize(String(next)))}>
            {TEXT_SIZES.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                <span aria-hidden className={cn("w-5 text-center leading-none font-semibold", PREVIEW_CLASS[option])}>
                  A
                </span>
                {TEXT_SIZE_LABELS[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
