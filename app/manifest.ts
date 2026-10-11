import type { MetadataRoute } from "next";

import { COMPANY } from "@/features/storefront/domain/legal";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: COMPANY.brand,
    short_name: COMPANY.brand,
    description:
      "Çiftlikten sofranıza taze yumurta ve süt ürünleri. Online sipariş verin, biz getirelim.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf9",
    theme_color: "#1b4a26",
    lang: "tr",
    icons: [
      {
        src: "/brand/apuhan-logo.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
