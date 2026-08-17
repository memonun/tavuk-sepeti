import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

/**
 * A deliberately separate section from the two delivery-scope cards above:
 * those two answer "where are you", this one answers "how do you want to
 * buy". Different background tint + layout so it never reads as a third
 * option in the same choice, per the design brief.
 */
export function RecurringOrderTeaser() {
  return (
    <section className="mt-6">
      <Link
        href="/duzenli-siparis"
        className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-primary/40 bg-accent/40 p-5 transition-colors hover:bg-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            🔄
          </span>
          <div>
            <p className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
              Düzenli Sipariş
            </p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              Her hafta düzenli aldığınız ürünleri tekrar tekrar sipariş
              vermeden planlayın.
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-primary sm:self-center">
          Düzenli Sipariş
          <ArrowRightIcon className="size-4" aria-hidden />
        </span>
      </Link>
    </section>
  );
}
