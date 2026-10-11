import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";


export function EmailConfirmed({ next }: { next: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-(--shop-shadow-sm)">
        <CheckCircle2Icon className="size-12 text-primary" />
        <h1 className="font-display text-3xl leading-tight">E-postan doğrulandı!</h1>
        <p className="text-base text-muted-foreground">
          Hesabın artık hazır. Hemen alışverişe başlayabilirsin.
        </p>
        <Link
          href={next}
          className="shop-btn shop-press shop-focus" data-variant="primary" data-size="lg"
        >
          Devam et
        </Link>
      </div>
    </main>
  );
}
