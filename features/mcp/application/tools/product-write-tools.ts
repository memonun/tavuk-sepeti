/**
 * Product catalog + pricing write tools — thin adapters over the panel's
 * product Server Actions. Price changes affect FUTURE orders only (existing
 * orders keep their frozen line prices).
 */
import "server-only";

import {
  createProductInput,
  deleteProductInput,
  setProductActiveInput,
  setProductFlagsInput,
  setProductPricingInput,
  updateProductInput,
} from "@/features/mcp/domain/mcp-write-inputs";
import { createProductAction } from "@/features/products/application/create-product";
import { deleteProductAction } from "@/features/products/application/delete-product";
import { listAllProducts } from "@/features/products/application/list-products";
import { saveProductPricingAction } from "@/features/products/application/save-product-pricing";
import { setProductActiveAction } from "@/features/products/application/set-product-active";
import { updateProductFlagsAction } from "@/features/products/application/set-product-flags";
import { updateProductMetadataAction } from "@/features/products/application/update-product-metadata";

import { DESTRUCTIVE, WRITE } from "./annotations";
import { toolError, toolFromResult, toolRefusal } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerProductWriteTools(server: McpServer): void {
  server.registerTool(
    "create_product",
    {
      title: "Ürün ekle",
      description:
        "Kataloğa yeni ürün ekler (anahtar sunucuda üretilir). Birim fiyat kuruş cinsindendir; kademeli fiyat için sonra set_product_pricing kullan.",
      inputSchema: createProductInput,
      annotations: { ...WRITE, title: "Ürün ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_product", await createProductAction(input));
      } catch (cause) {
        return toolError("create_product", cause);
      }
    },
  );

  server.registerTool(
    "update_product",
    {
      title: "Ürün bilgilerini düzenle",
      description:
        "Ürünün adı, birimi, miktar kuralları, kargo/teslimat tipi ve mağaza açıklamasını günceller. Sadece gönderdiğin alanlar değişir. Fiyat için set_product_pricing kullan.",
      inputSchema: updateProductInput,
      annotations: { ...WRITE, title: "Ürün bilgilerini düzenle" },
    },
    async ({ product_key, ...fields }) => {
      try {
        // The action replaces the whole metadata block, so overlay the fields
        // we were given on the current product instead of blanking the rest.
        const all = await listAllProducts();
        if (!all.ok) return toolError("update_product", all.error);
        const current = all.value.find((p) => p.key === product_key);
        if (!current) return toolRefusal("Ürün bulunamadı.");

        const result = await updateProductMetadataAction({
          product_key,
          display_name: fields.display_name ?? current.display_name,
          unit: fields.unit ?? current.unit,
          unit_label: fields.unit_label ?? current.unit_label,
          package_size: fields.package_size ?? current.package_size,
          min_qty: fields.min_qty ?? current.min_qty,
          step: fields.step ?? current.step,
          fulfillment_type: fields.fulfillment_type ?? current.fulfillment_type,
          web_description:
            fields.web_description !== undefined ? fields.web_description : current.web_description,
          image_alt: fields.image_alt !== undefined ? fields.image_alt : current.image_alt,
        });
        return toolFromResult("update_product", result, { productKey: product_key });
      } catch (cause) {
        return toolError("update_product", cause, { productKey: product_key });
      }
    },
  );

  server.registerTool(
    "set_product_pricing",
    {
      title: "Ürün fiyatını değiştir",
      description:
        "Ürünün birim fiyatını ve miktar kademelerini ayarlar (kuruş). Yalnızca YENİ siparişleri etkiler; mevcut siparişlerin fiyatı donmuştur. Kademeler tamamen yer değiştirir: önce list_products ile mevcut kademeleri oku.",
      inputSchema: setProductPricingInput,
      annotations: { ...WRITE, title: "Ürün fiyatını değiştir" },
    },
    async (input) => {
      try {
        return toolFromResult("set_product_pricing", await saveProductPricingAction(input), {
          productKey: input.product_key,
        });
      } catch (cause) {
        return toolError("set_product_pricing", cause, { productKey: input.product_key });
      }
    },
  );

  server.registerTool(
    "set_product_active",
    {
      title: "Ürünü arşivle / geri getir",
      description: "Ürünü arşivler (sipariş formlarında ve mağazada görünmez) veya geri getirir.",
      inputSchema: setProductActiveInput,
      annotations: { ...WRITE, title: "Ürünü arşivle / geri getir" },
    },
    async (input) => {
      try {
        return toolFromResult("set_product_active", await setProductActiveAction(input), {
          productKey: input.product_key,
        });
      } catch (cause) {
        return toolError("set_product_active", cause, { productKey: input.product_key });
      }
    },
  );

  server.registerTool(
    "set_product_flags",
    {
      title: "Ürün mağaza ayarları",
      description: "Ürünün mağazada görünür olup olmadığını ve öne çıkan olup olmadığını değiştirir.",
      inputSchema: setProductFlagsInput,
      annotations: { ...WRITE, title: "Ürün mağaza ayarları" },
    },
    async (input) => {
      try {
        return toolFromResult(
          "set_product_flags",
          await updateProductFlagsAction({
            product_key: input.product_key,
            ...(input.is_web_visible !== undefined ? { is_web_visible: input.is_web_visible } : {}),
            ...(input.is_featured !== undefined ? { is_featured: input.is_featured } : {}),
          }),
          { productKey: input.product_key },
        );
      } catch (cause) {
        return toolError("set_product_flags", cause, { productKey: input.product_key });
      }
    },
  );

  server.registerTool(
    "delete_product",
    {
      title: "Ürünü sil",
      description:
        "Ürünü KALICI olarak siler. Yalnızca hiçbir siparişte kullanılmamış ürünler silinebilir; aksi halde set_product_active ile arşivle. Geri alınamaz.",
      inputSchema: deleteProductInput,
      annotations: { ...DESTRUCTIVE, title: "Ürünü sil" },
    },
    async ({ product_key }) => {
      try {
        return toolFromResult("delete_product", await deleteProductAction({ product_key }), {
          productKey: product_key,
        });
      } catch (cause) {
        return toolError("delete_product", cause, { productKey: product_key });
      }
    },
  );
}
