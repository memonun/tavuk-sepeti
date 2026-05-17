/**
 * Sticky column pinning style helper — Notion/Excel-style frozen first +
 * last columns. Adapted from TanStack's official column-pinning-sticky
 * example.
 *
 * Returns inline styles (position/left/right/zIndex) that ride on top of
 * Tailwind utility classes. The container MUST set
 * `style={{ borderCollapse: "separate" }}` (or class equivalent) for the
 * inset shadow on the last-left / first-right pinned columns to render —
 * otherwise the collapsed border eats it.
 */
import type { Column, RowData } from "@tanstack/react-table";
import type { CSSProperties } from "react";

export function getPinningStyles<T extends RowData>(
  column: Column<T, unknown>,
): CSSProperties {
  const pin = column.getIsPinned();
  if (pin === false) {
    return { position: "relative", width: column.getSize() };
  }
  const isLastLeft = pin === "left" && column.getIsLastColumn("left");
  const isFirstRight = pin === "right" && column.getIsFirstColumn("right");
  const styles: CSSProperties = {
    position: "sticky",
    width: column.getSize(),
    zIndex: 1,
    backgroundColor: "var(--background)",
  };
  if (pin === "left") {
    styles.left = `${column.getStart("left")}px`;
  } else {
    styles.right = `${column.getAfter("right")}px`;
  }
  if (isLastLeft) {
    styles.boxShadow = "-4px 0 4px -4px var(--border) inset";
  } else if (isFirstRight) {
    styles.boxShadow = "4px 0 4px -4px var(--border) inset";
  }
  return styles;
}

/** Header-row variant: same as cell, but with header background to keep
 *  the sticky header crisp during horizontal scroll. */
export function getPinningHeaderStyles<T extends RowData>(
  column: Column<T, unknown>,
): CSSProperties {
  const base = getPinningStyles(column);
  // Headers use muted background so the sticky header reads as a band
  // even when overlapping a body row.
  return { ...base, backgroundColor: "var(--muted)" };
}
