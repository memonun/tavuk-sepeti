"use client";

/**
 * A row of color swatches for the fixed accent palette — the color of a
 * calendar or a reminder list.
 */
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ACCENT_COLORS,
  ACCENT_COLOR_HEX,
  ACCENT_COLOR_LABELS,
  type AccentColor,
} from "@/shared/palette/accent-colors";

export function AccentColorPicker({
  value,
  onChange,
  label,
}: {
  value: AccentColor;
  onChange: (color: AccentColor) => void;
  /** Accessible name of the group, e.g. "Liste rengi". */
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {ACCENT_COLORS.map((color) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={ACCENT_COLOR_LABELS[color]}
            title={ACCENT_COLOR_LABELS[color]}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-white outline-none",
              "transition-transform duration-100 ease-out active:scale-90",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected && "ring-2 ring-foreground/25 ring-offset-2 ring-offset-background",
            )}
            style={{ backgroundColor: ACCENT_COLOR_HEX[color] }}
          >
            {selected ? <Check aria-hidden className="size-4" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}
