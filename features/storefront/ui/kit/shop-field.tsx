import { cn } from "@/lib/utils";

/**
 * Storefront form controls: 52px tall, 18px text, a border you can see.
 * Styling is `.shop-field` in `app/(shop)/theme.css`.
 *
 * Plain elements, not the shared `components/ui/input` — that one is 32px /
 * 14px for the admin's dense tables, and its 14px text makes iOS Safari zoom
 * the page on focus. Every native attribute passes straight through, so
 * `name`, `value`, `autoComplete`, `required`… behave exactly as on the
 * element itself.
 */
export const shopFieldClass = "shop-field";

export function ShopInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(shopFieldClass, className)} {...props} />;
}

export function ShopTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(shopFieldClass, className)} {...props} />;
}

export function ShopSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(shopFieldClass, className)} {...props} />;
}

/**
 * Label + control (+ optional helper line). The label is the shop's normal
 * dark text, bold — a grey label over a grey box is the hardest thing on a
 * form for an older reader to pair up.
 */
export function ShopField({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-base font-bold text-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-base text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
