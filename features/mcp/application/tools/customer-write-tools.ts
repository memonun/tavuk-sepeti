/**
 * Customer write tools — thin adapters over the panel's customer Server Actions.
 * The connector does NOT call Google: an address without lat/lng is saved
 * pinless (the same state the panel produces without a geocode) and the pin is
 * corrected in the panel (CLAUDE.md §8, §14).
 */
import "server-only";

import {
  buildCreateCustomerFormData,
  buildUpdateCustomerFormData,
} from "@/features/mcp/application/tools/customer-form-data";
import {
  createCustomerInput,
  deleteCustomersInput,
  updateCustomerInput,
} from "@/features/mcp/domain/mcp-write-inputs";
import { bulkDeleteCustomersAction } from "@/features/customers/application/bulk-delete-customers";
import { createCustomerAction } from "@/features/customers/application/create-customer";
import { getCustomerById } from "@/features/customers/application/get-customer";
import { updateCustomerAction } from "@/features/customers/application/update-customer";

import { DESTRUCTIVE, WRITE } from "./annotations";
import { toolError, toolFromResult, toolFromState } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCustomerWriteTools(server: McpServer): void {
  server.registerTool(
    "create_customer",
    {
      title: "Müşteri ekle",
      description:
        "Yeni müşteri oluşturur. Aynı kişi zaten varsa önce list_customers ile ara. Adres Google'da konumlandırılmaz; lat/lng verilmezse müşteri haritada pinsiz kalır.",
      inputSchema: createCustomerInput,
      annotations: { ...WRITE, title: "Müşteri ekle" },
    },
    async (input) => {
      try {
        return toolFromState(
          await createCustomerAction({ status: "idle" }, buildCreateCustomerFormData(input)),
        );
      } catch (cause) {
        return toolError("create_customer", cause);
      }
    },
  );

  server.registerTool(
    "update_customer",
    {
      title: "Müşteriyi düzenle",
      description:
        "Müşteri bilgilerini günceller. Sadece gönderdiğin alanlar değişir; göndermediklerin korunur (alanı silmek için null gönder). Adres verirsen mevcut adresle birleştirilir, lat/lng verilmezse mevcut pin korunur.",
      inputSchema: updateCustomerInput,
      annotations: { ...WRITE, title: "Müşteriyi düzenle" },
    },
    async ({ customer_id, ...fields }) => {
      try {
        const existing = await getCustomerById(customer_id);
        if (!existing.ok) return toolError("update_customer", existing.error, { customerId: customer_id });
        return toolFromState(
          await updateCustomerAction(
            customer_id,
            { status: "idle" },
            buildUpdateCustomerFormData(existing.value, fields),
          ),
        );
      } catch (cause) {
        return toolError("update_customer", cause, { customerId: customer_id });
      }
    },
  );

  server.registerTool(
    "delete_customers",
    {
      title: "Müşterileri sil",
      description:
        "Müşterileri KALICI olarak siler (adresleriyle birlikte). Siparişi olan müşteriler silinmez ve sonuçta ayrıca belirtilir. Geri alınamaz.",
      inputSchema: deleteCustomersInput,
      annotations: { ...DESTRUCTIVE, title: "Müşterileri sil" },
    },
    async ({ customer_ids }) => {
      try {
        return toolFromResult("delete_customers", await bulkDeleteCustomersAction(customer_ids));
      } catch (cause) {
        return toolError("delete_customers", cause);
      }
    },
  );
}
