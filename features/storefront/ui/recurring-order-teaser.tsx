import Link from "next/link";
import { ArrowRightIcon, RepeatIcon } from "lucide-react";

/**
 * A deliberately separate section from the two delivery-scope cards above:
 * those two answer "where are you", this one answers "how do you want to
 * buy". Solid neutral card (not the primary/destructive fill the scope cards
 * use) so it never reads as a third option in the same choice, per the
 * design brief — it's a doorway to a different flow, not a third answer to
 * "where are you".
 */
export function RecurringOrderTeaser() {
  return (
    <section className="mt-4">
      <Link
        href="/duzenli-siparis"
        className="flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground sm:size-14">
          <RepeatIcon className="size-6 sm:size-7" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground sm:text-xl">
            Düzenli Sipariş
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Her hafta aldığınız ürünleri tekrar tekrar sipariş vermeden
            planlayın.
          </p>
        </div>
        <ArrowRightIcon
          className="size-5 shrink-0 text-primary"
          aria-hidden
        />
      </Link>
    </section>
  );
}
