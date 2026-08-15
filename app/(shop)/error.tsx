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

import { Button } from "@/components/ui/button";

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
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
        <AlertTriangleIcon className="size-12 text-muted-foreground" />
        <h1 className="font-display text-2xl">Bir şeyler ters gitti</h1>
        <p className="text-sm text-muted-foreground">
          Beklenmedik bir hata oluştu. Sepetiniz duruyor — tekrar deneyebilir
          veya alışverişe kaldığınız yerden devam edebilirsiniz.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="lg"
            className="rounded-full"
            onClick={() => reset()}
          >
            Tekrar dene
          </Button>
          {/* A hard load rather than a soft navigation: if the failure is in a
              shared server component, client-side routing lands right back in
              the boundary. */}
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Ana sayfa
          </Button>
        </div>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            Hata kodu: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
