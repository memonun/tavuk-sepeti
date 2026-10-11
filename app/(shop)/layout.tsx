import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";

import { getViewer } from "@/features/auth/application/get-viewer";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { COMPANY } from "@/features/storefront/domain/legal";
import { CartProvider } from "@/features/storefront/ui/cart-provider";
import { HOME_INTRO_SKIP_SCRIPT } from "@/features/storefront/ui/home-hero-intro";
import { MetaPixelTracker } from "@/features/storefront/ui/meta-pixel-tracker";
import { MobileBottomNav } from "@/features/storefront/ui/mobile-bottom-nav";
import { ShopFooter } from "@/features/storefront/ui/shop-footer";
import { ShopHeader } from "@/features/storefront/ui/shop-header";
import { WhatsAppSupportButton } from "@/features/storefront/ui/whatsapp-support-button";
import { Toaster } from "@/components/ui/sonner";
import { isMetaPixelEnabled } from "@/shared/analytics/meta-pixel-config";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

import "./theme.css";

// Body: Atkinson Hyperlegible Next — drawn for low-vision readers (I / l / 1
// and O / 0 never collapse into each other), which is the storefront's actual
// audience. Display: Bricolage Grotesque — a warm, sign-painter grotesque for
// headings only. latin-ext covers Turkish diacritics (ğ, İ/ı, ş, ç, ü, ö).
const shopBody = Atkinson_Hyperlegible_Next({
  variable: "--font-shop-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
const shopDisplay = Bricolage_Grotesque({
  variable: "--font-shop-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // Optical size: the face redraws itself between a sturdy text cut and a
  // tighter display cut, and the browser picks by rendered size.
  axes: ["opsz"],
});

// The `variable` classes above only reach the `.shop-theme` subtree, but the
// basket, the menu and every dialog are portalled to <body>. Publishing the
// same two families on the root (only while a storefront page is mounted)
// lets theme.css use them there too.
const rootFontVars = `:root:has(.shop-theme){--font-shop-body:${shopBody.style.fontFamily};--font-shop-display:${shopDisplay.style.fontFamily}}`;

// Matches the header (the colour at the very top of the page), so the phone's
// status bar reads as part of the shop. Repeats the root layout's fields
// rather than relying on segment merging.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffdf9",
};

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
        url: `${CANONICAL_ORIGIN}/brand/apuhan-ciftligi-logo.png`,
        width: 512,
        height: 512,
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
      <style dangerouslySetInnerHTML={{ __html: rootFontVars }} />
      {/* Before first paint: has this session already seen the home page's
          opening picture? See home-hero-intro.ts. */}
      <script dangerouslySetInnerHTML={{ __html: HOME_INTRO_SKIP_SCRIPT }} />
      {/* `min-h-dvh`, not `min-h-screen`: on mobile Safari/Chrome `100vh` is
          the LARGE viewport (toolbars collapsed), so a `100vh` shell is always
          taller than what is actually on screen and the page picks up a
          phantom scroll that never reaches real content. `dvh` tracks the
          visible viewport. */}
      <div
        className={`${shopBody.variable} ${shopDisplay.variable} shop-theme flex min-h-dvh flex-col bg-background text-foreground`}
      >
        {/* Meta Pixel PageView. Rendered ONLY when NEXT_PUBLIC_META_PIXEL_ID is a
            valid ID — otherwise this does not exist and nothing loads. */}
        {isMetaPixelEnabled() ? <MetaPixelTracker /> : null}
        <CartProvider>
          <ShopHeader
            products={products}
            cargoMinOrderMinor={settings.cargoMinOrderMinor}
            deliveryFeeMinor={settings.homeDeliveryFeeMinor}
            authed={authed}
            isAdmin={isAdmin}
          />
          <div className="flex-1">{children}</div>
          {/* `--shop-dock` (theme.css) is the dock's real height: the tab bar,
              plus the basket bar while the basket has anything in it.
              Reserves room for the fixed mobile tab bar so it never sits on
              top of a page's own last button OR the footer's last line —
              every route under this layout gets the clearance for free, not
              just the ones that remembered to pad themselves. Wraps the
              footer too: the tab bar is the last thing in DOM order but the
              first thing painted on top, so anything above it needs the
              padding, not just `children`. */}
          <div className="pb-(--shop-dock) sm:pb-0">
            <ShopFooter />
          </div>
        </CartProvider>
        <WhatsAppSupportButton />
        <MobileBottomNav
          products={products}
          cargoMinOrderMinor={settings.cargoMinOrderMinor}
          deliveryFeeMinor={settings.homeDeliveryFeeMinor}
          authed={authed}
        />
        {/* The storefront never had a toaster of its own (only the admin layout
            mounted one), so every `toast()` in the shop was silently dropped.
            Top-centre keeps it clear of the tab bar and the WhatsApp button;
            a long duration and a close button, because the audience reads
            slowly and should never have to race a message. */}
        <Toaster
          theme="light"
          position="top-center"
          closeButton
          toastOptions={{
            duration: 7000,
            // Sonner's injected styles win the cascade, hence the `!`.
            // The action ("Geri al") is the reason these toasts exist, so it
            // is a real 44px button, not Sonner's 24px chip.
            classNames: {
              toast: "cn-toast",
              actionButton:
                "!h-11 !rounded-full !bg-primary !px-4 !text-base !font-bold !text-primary-foreground",
              closeButton: "!size-7 [&_svg]:!size-4",
            },
            style: { fontSize: "1.0625rem", lineHeight: 1.35 },
          }}
        />
      </div>
    </>
  );
}
