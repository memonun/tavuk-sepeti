import type { MetadataRoute } from "next";

import { COMPANY } from "@/features/storefront/domain/legal";
import { STOREFRONT_DESCRIPTION } from "@/features/storefront/domain/structured-data";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: COMPANY.brand,
    short_name: COMPANY.brand,
    description: STOREFRONT_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf9",
    theme_color: "#1b4a26",
    lang: "tr",
    icons: [
      {
        src: "/brand/apuhan-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/apuhan-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/apuhan-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
