import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A message the customer has to actually read: a delivery rule, a missing
 * step, an error. Always 16px or larger, always with an icon AND a tinted
 * panel — the old versions of these were 12px grey or red lines that an older
 * shopper could miss entirely, and tone was carried by colour alone.
 */
export type ShopNoticeTone = "info" | "success" | "warning" | "danger";

const toneClass: Record<ShopNoticeTone, string> = {
  info: "border-border bg-muted",
  success: "border-primary/30 bg-(--shop-green-soft)",
  warning: "border-(--shop-apricot) bg-(--shop-apricot-soft)",
  danger: "border-destructive/40 bg-(--shop-red-soft)",
};

const iconClass: Record<ShopNoticeTone, string> = {
  info: "text-muted-foreground",
  success: "text-primary",
  warning: "text-foreground",
  danger: "text-destructive",
};

const toneIcon = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  danger: CircleAlertIcon,
} as const;

export function ShopNotice({
  tone = "info",
  icon,
  title,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  tone?: ShopNoticeTone | undefined;
  /** Replaces the tone's default icon (pass a sized lucide icon). */
  icon?: React.ReactNode;
  title?: React.ReactNode;
}) {
  const Icon = toneIcon[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-base leading-relaxed text-foreground",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-6", iconClass[tone])}>
        {icon ?? <Icon aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
