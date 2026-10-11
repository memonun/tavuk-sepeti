import { cn } from "@/lib/utils";

/**
 * Class overrides for a storefront `<SheetContent>`.
 *
 * The shared sheet fades in with a 40px nudge, which is right for a dense
 * admin side panel but reads as "something appeared" rather than "a panel
 * slid in from that edge". The shop's sheets travel their full width along
 * one path — in from the edge their button sits on, out the same way — on the
 * drawer curve, with no opacity change (a panel is a solid object).
 *
 * Reduced motion is handled globally (app/globals.css collapses the duration).
 */
export function shopSheetClass(className?: string): string {
  return cn(
    "gap-0 bg-background text-base text-foreground shadow-(--shop-shadow-lg) duration-300 ease-(--shop-ease-drawer)",
    "data-starting-style:opacity-100 data-ending-style:opacity-100",
    "data-[side=right]:data-starting-style:translate-x-full data-[side=right]:data-ending-style:translate-x-full",
    "data-[side=left]:data-starting-style:-translate-x-full data-[side=left]:data-ending-style:-translate-x-full",
    "data-[side=bottom]:data-starting-style:translate-y-full data-[side=bottom]:data-ending-style:translate-y-full",
    className,
  );
}
