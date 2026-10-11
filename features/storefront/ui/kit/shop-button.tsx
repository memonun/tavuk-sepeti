import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The storefront's own button. Deliberately NOT a variant of the shared
 * `components/ui/button` — that one is sized for the admin (32–36px, 14px
 * text) and is imported by ~70 admin files, so growing it there would resize
 * the whole panel. This one starts at 48px / 17px, has a pressed state that
 * answers on pointer-down, and a disabled state that stays readable.
 *
 * Styling lives in `app/(shop)/theme.css` (`.shop-btn`), keyed off data
 * attributes, so a `<Link>` and a `<button>` are guaranteed to look and press
 * identically.
 */
export type ShopButtonVariant = "primary" | "secondary" | "quiet" | "plain" | "danger";
export type ShopButtonSize = "md" | "lg";

interface ShopButtonStyleProps {
  variant?: ShopButtonVariant | undefined;
  size?: ShopButtonSize | undefined;
  /** Full width of its container. */
  block?: boolean | undefined;
}

function styleAttrs({ variant = "primary", size = "md", block = false }: ShopButtonStyleProps) {
  return {
    "data-variant": variant,
    "data-size": size,
    "data-block": block ? "true" : undefined,
  } as const;
}

const baseClass = "shop-btn shop-press shop-focus";

export function ShopButton({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & ShopButtonStyleProps) {
  return (
    <button
      type={type}
      className={cn(baseClass, className)}
      {...styleAttrs({ variant, size, block })}
      {...props}
    />
  );
}

export function ShopLinkButton({
  variant,
  size,
  block,
  className,
  ...props
}: React.ComponentProps<typeof Link> & ShopButtonStyleProps) {
  return (
    <Link
      className={cn(baseClass, className)}
      {...styleAttrs({ variant, size, block })}
      {...props}
    />
  );
}
