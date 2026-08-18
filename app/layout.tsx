// Boot-time env validation. Importing this here means a missing/invalid env
// crashes the Next server at startup rather than at the first request.
// SPEC.md §10 / CLAUDE.md §10.
import "@/shared/env";

import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

// Inter is the SaaS-dashboard standard — designed for screen UI, excellent
// at small sizes, full Turkish diacritic support (ğ, İ/ı, ş, ç, ü, ö).
// We expose it as `--font-sans` so Tailwind's font-sans utility picks it up.
const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apuhan Çiftliği — Admin",
  description: "Sipariş, müşteri ve teslimat yönetimi.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes — it injects the
    // `class="dark"` before React hydrates, which would otherwise mismatch.
    //
    // No height/flex constraints on <html>/<body>: every subtree below
    // (storefront, admin shell, /login) sets its own full-height wrapper, and a
    // definite `height: 100%` root over a flex `body` makes WebKit resolve the
    // body's height as definite — the document's scrollable height stays pinned
    // to one viewport and everything past the fold becomes unreachable on iOS.
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${interSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-dvh">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={300}>{children}</TooltipProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
