import type { Metadata } from "next";
import { Fraunces } from "next/font/google";

import { getViewer } from "@/features/auth/application/get-viewer";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { COMPANY } from "@/features/storefront/domain/legal";
import { CartProvider } from "@/features/storefront/ui/cart-provider";
import { MobileBottomNav } from "@/features/storefront/ui/mobile-bottom-nav";
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
 * client cart. The header basket AND the mobile tab bar's basket tab both
 * need the catalog to resolve line names, and both need the cargo floor and
 * the viewer, so all three are fetched once here rather than once per
 * component — each is cached/cheap on its own, but a customer on 3G still
 * pays for however many round trips render on top of them.
 */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [catalog, settings, { authed, isAdmin }] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontSettings(),
    getViewer(),
  ]);
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
          <ShopHeader
            products={products}
            cargoMinOrderMinor={settings.cargoMinOrderMinor}
            authed={authed}
            isAdmin={isAdmin}
          />
          <div className="flex-1">{children}</div>
          {/* Reserves room for the fixed mobile tab bar so it never sits on
              top of a page's own last button OR the footer's last line —
              every route under this layout gets the clearance for free, not
              just the ones that remembered to pad themselves. Wraps the
              footer too: the tab bar is the last thing in DOM order but the
              first thing painted on top, so anything above it needs the
              padding, not just `children`. */}
          <div className="pb-20 sm:pb-0">
            <ShopFooter />
          </div>
        </CartProvider>
        <WhatsAppSupportButton />
        <MobileBottomNav
          products={products}
          cargoMinOrderMinor={settings.cargoMinOrderMinor}
          authed={authed}
        />
      </div>
    </>
  );
}
