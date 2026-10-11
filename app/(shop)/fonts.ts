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

export const shopDisplay = Bricolage_Grotesque({
  variable: "--font-shop-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // Optical size: the face redraws itself between a sturdy text cut and a
  // tighter display cut, and the browser picks by rendered size.
  axes: ["opsz"],
});
