"use client";

/**
 * Storefront error boundary.
 *
 * Without one, any unhandled throw in a shop Server Component or Server Action
 * renders Next's built-in "Application error: a server-side exception has
 * occurred" — in English, with no way back, to a Turkish customer who may be
 * holding a full basket. The basket itself lives in localStorage and survives,
 * so the important thing this page does is say so and offer a retry.
 */
import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";

import { ShopButton } from "@/features/storefront/ui/kit/shop-button";

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server already logged the throw; `digest` is what correlates this
    // screen with that entry (CLAUDE.md §5 — nothing is swallowed silently).
    // eslint-disable-next-line no-console
    console.error("storefront_error", { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-card p-6 text-center shadow-(--shop-shadow-sm) sm:p-8">
        <AlertTriangleIcon className="size-14 text-destructive" aria-hidden />
        <h1 className="font-display text-3xl leading-tight">Bir şeyler ters gitti</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Beklenmedik bir hata oluştu. Sepetiniz duruyor. Tekrar deneyebilir
          veya alışverişe kaldığınız yerden devam edebilirsiniz.
        </p>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <ShopButton size="lg" onClick={() => reset()}>
            Tekrar dene
          </ShopButton>
          {/* A hard load rather than a soft navigation: if the failure is in a
              shared server component, client-side routing lands right back in
              the boundary. */}
          <ShopButton
            size="lg"
            variant="secondary"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Ana sayfaya dön
          </ShopButton>
        </div>
        {error.digest ? (
          <p className="text-base text-muted-foreground">
            Hata kodu: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
