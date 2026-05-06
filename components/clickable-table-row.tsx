"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, type KeyboardEvent, type MouseEvent } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ClickableTableRowProps extends ComponentProps<typeof TableRow> {
  href: string;
}

/**
 * Table row that navigates to `href` on click anywhere except an interactive
 * descendant. An inner <a> / <button> / Link still wins (we bail when the
 * event target is inside one), so the customer column in the order row can
 * still take you to the customer page.
 *
 * Keyboard: focusable + Enter activates. We use `role="link"` since the
 * primary action of the row is navigation.
 */
export function ClickableTableRow({
  href,
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}: ClickableTableRowProps) {
  const router = useRouter();

  const isInteractive = (target: EventTarget) =>
    target instanceof HTMLElement &&
    target.closest("a, button, input, select, textarea, [role='button']") !== null;

  const handleClick = (e: MouseEvent<HTMLTableRowElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.target && isInteractive(e.target)) return;
    router.push(href);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target && isInteractive(e.target)) return;
    e.preventDefault();
    router.push(href);
  };

  return (
    <TableRow
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </TableRow>
  );
}
