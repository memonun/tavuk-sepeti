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
    background_color: "#f8f4eb",
    theme_color: "#c9872f",
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
