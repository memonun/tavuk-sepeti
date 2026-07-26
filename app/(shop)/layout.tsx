import type { Metadata } from "next";
import { Fraunces } from "next/font/google";

import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { CartProvider } from "@/features/storefront/ui/cart-provider";
import { ShopHeader } from "@/features/storefront/ui/shop-header";

import "./theme.css";

// Elegant, soft serif for storefront display type. latin-ext covers Turkish
// diacritics (ğ, İ/ı, ş, ç, ü, ö). Exposed as a CSS var the shop theme reads.
const shopSerif = Fraunces({
  variable: "--font-shop-serif",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tavuk Sepeti — Taze ürünler, kapınızda",
  description:
    "Çiftlikten sofranıza taze yumurta ve süt ürünleri. Online sipariş verin, biz getirelim.",
};

/**
 * Public storefront shell (`/`). Nests inside the root layout but scopes
 * its own soft light palette via `.shop-theme` (see theme.css) and wraps the
 * client cart. The header basket needs the catalog to resolve line names, so we
 * fetch it here (memoized — the page reuses the same query).
 */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const catalog = await getStorefrontCatalog();
  const products = catalog.ok ? catalog.value : [];

  return (
    <div
      className={`${shopSerif.variable} shop-theme flex min-h-screen flex-col bg-background text-foreground`}
    >
      <CartProvider>
        <ShopHeader products={products} />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
            <p className="font-display text-base text-foreground">Tavuk Sepeti</p>
            <p className="mt-1">Taze yumurta ve süt ürünleri · kapınıza teslim.</p>
          </div>
        </footer>
      </CartProvider>
    </div>
  );
}
