import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";

/**
 * The storefront's two typefaces, declared once so the shop layout and the
 * site-wide 404 (app/not-found.tsx, which renders outside the shop layout)
 * load the very same files.
 *
 * Body: Atkinson Hyperlegible Next — drawn for low-vision readers (I / l / 1
 * and O / 0 never collapse into each other), which is the storefront's actual
 * audience. Display: Bricolage Grotesque — a warm, sign-painter grotesque for
 * headings and prices. latin-ext covers Turkish diacritics (ğ, İ/ı, ş, ç, ü, ö).
 */
export const shopBody = Atkinson_Hyperlegible_Next({
  variable: "--font-shop-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Not preloaded (the body face is). Its two files are ~108 KB of the shop's
// ~161 KB of fonts — the latin file alone is 77 KB, the price of the opsz axis
// — and a preload fetches them at high priority alongside the stylesheet the
// first paint waits on. On a slow phone (Lighthouse, devtools throttling,
// 2026-10-18) that delayed the first paint by ~0.3 s and the first product
// picture by ~0.4 s. Unpreloaded, the browser asks for them as soon as the
// stylesheet is in, and headings swap in only ~0.2 s later than before
// (≈5.5 s vs 5.3 s): with `swap` they were never in the first paint anyway.
// Both subsets still load for every page that shows Turkish text — the
// browser picks them by unicode-range, preload or not.
// Known side effect: Lighthouse's SIMULATED mode (what PageSpeed Insights
// reports) models a font found via the stylesheet as blocking the first
// paint, so its FCP reads 0.9 → 1.5 s (still green) while its LCP and score
// improve. A real browser never waits for a `swap` font to paint.
export const shopDisplay = Bricolage_Grotesque({
  variable: "--font-shop-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  // Optical size: the face redraws itself between a sturdy text cut and a
  // tighter display cut, and the browser picks by rendered size.
  axes: ["opsz"],
});
