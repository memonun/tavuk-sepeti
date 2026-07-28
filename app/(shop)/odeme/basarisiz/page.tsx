import Link from "next/link";
import { XCircleIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function PaymentFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const { no } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
        <XCircleIcon className="size-12 text-destructive" />
        <h1 className="font-display text-2xl">Ödeme tamamlanamadı</h1>
        {no ? (
          <p className="text-sm text-muted-foreground">
            Sipariş: <span className="font-mono">{no}</span> — ödeme bekliyor.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Ödemeniz alınamadı. Sepetiniz duruyor; tekrar deneyebilir veya farklı
          bir ödeme yöntemi seçebilirsiniz.
        </p>
        <Link
          href="/odeme"
          className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
        >
          Tekrar dene
        </Link>
      </div>
    </main>
  );
}
