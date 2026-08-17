import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmailConfirmed({ next }: { next: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
        <CheckCircle2Icon className="size-12 text-primary" />
        <h1 className="font-display text-2xl">E-postan doğrulandı!</h1>
        <p className="text-sm text-muted-foreground">
          Hesabın artık hazır. Hemen alışverişe başlayabilirsin.
        </p>
        <Link
          href={next}
          className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
        >
          Devam et
        </Link>
      </div>
    </main>
  );
}
