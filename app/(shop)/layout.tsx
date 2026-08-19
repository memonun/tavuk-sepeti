import type { Metadata } from "next";
import { Fraunces } from "next/font/google";

import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { COMPANY } from "@/features/storefront/domain/legal";
import { CartProvider } from "@/features/storefront/ui/cart-provider";
import { ShopFooter } from "@/features/storefront/ui/shop-footer";
import { ShopHeader } from "@/features/storefront/ui/shop-header";
import { WhatsAppSupportButton } from "@/features/storefront/ui/whatsapp-support-button";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

import "./theme.css";

// Elegant, soft serif for storefront display type. latin-ext covers Turkish
// diacritics (ğ, İ/ı, ş, ç, ü, ö). Exposed as a CSS var the shop theme reads.
const shopSerif = Fraunces({
  variable: "--font-shop-serif",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Apuhan Çiftliği — Taze ürünler, kapınızda",
    template: "%s | Apuhan Çiftliği",
  },
  description:
    "Çiftlikten sofranıza taze yumurta ve süt ürünleri. Online sipariş verin, biz getirelim.",
  applicationName: COMPANY.brand,
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: COMPANY.brand,
    title: "Apuhan Çiftliği — Taze ürünler, kapınızda",
    description:
      "Çiftlikten sofranıza taze yumurta ve süt ürünleri. Online sipariş verin, biz getirelim.",
    url: CANONICAL_ORIGIN,
    images: [
      {
        url: "/brand/apuhan-og.png",
        type: "image/png",
        width: 1200,
        height: 630,
        alt: "Apuhan Çiftliği — Taze ürünler, kapınızda",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apuhan Çiftliği — Taze ürünler, kapınızda",
    description:
      "Çiftlikten sofranıza taze yumurta ve süt ürünleri. Online sipariş verin, biz getirelim.",
    images: ["/brand/apuhan-og.png"],
  },
};

const publicStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${CANONICAL_ORIGIN}/#organization`,
      name: COMPANY.brand,
      url: CANONICAL_ORIGIN,
      logo: {
        "@type": "ImageObject",
        url: `${CANONICAL_ORIGIN}/brand/apuhan-logo.png`,
        width: 256,
        height: 256,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${CANONICAL_ORIGIN}/#website`,
      url: CANONICAL_ORIGIN,
      name: COMPANY.brand,
      description:
        "Çiftlikten sofranıza taze yumurta ve süt ürünleri. Online sipariş verin, biz getirelim.",
      inLanguage: "tr-TR",
      publisher: { "@id": `${CANONICAL_ORIGIN}/#organization` },
    },
  ],
} as const;

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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(publicStructuredData),
        }}
      />
      {/* `min-h-dvh`, not `min-h-screen`: on mobile Safari/Chrome `100vh` is
          the LARGE viewport (toolbars collapsed), so a `100vh` shell is always
          taller than what is actually on screen and the page picks up a
          phantom scroll that never reaches real content. `dvh` tracks the
          visible viewport. */}
      <div
        className={`${shopSerif.variable} shop-theme flex min-h-dvh flex-col bg-background text-foreground`}
      >
        <CartProvider>
          <ShopHeader products={products} />
          <div className="flex-1">{children}</div>
          <ShopFooter />
        </CartProvider>
        <WhatsAppSupportButton />
      </div>
    </>
  );
}
