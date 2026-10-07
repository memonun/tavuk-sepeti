/**
 * Zod input shapes for the Claude connector tools. Raw shapes (not z.object) —
 * that is what the MCP SDK's `registerTool` takes; the SDK wraps and validates
 * them, and the application layer re-parses with the owning feature's schema
 * (single source of truth), so these only describe + clamp the connector
 * surface.
 *
 * Pagination follows CLAUDE.md §9: default 25, max 100 (the panel grid's
 * 2000-row page size is deliberately NOT exposed here).
 */
import { z } from "zod";

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.");

const page = z.number().int().positive().default(1);
const pageSize = z.number().int().positive().max(100).default(25);

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const listOrdersInput = {
  status: z.enum(ORDER_STATUSES).optional().describe("Sipariş durumu filtresi."),
  fulfillment_channel: z
    .enum(["delivery", "shipping"])
    .optional()
    .describe("delivery = rota/teslimat, shipping = kargo."),
  scheduled_from: ymd.optional().describe("Planlanan tarih başlangıcı (dahil)."),
  scheduled_to: ymd.optional().describe("Planlanan tarih bitişi (dahil)."),
  customer_id: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional().describe("Sipariş no, müşteri adı veya telefon ara."),
  page,
  pageSize,
};

export const getOrderInput = {
  order_id: z.string().uuid(),
};

export const listCustomersInput = {
  q: z.string().trim().max(100).optional().describe("Ad, telefon vb. ara."),
  page,
  pageSize,
};

export const getCustomerInput = {
  customer_id: z.string().uuid(),
};

export const financeSummaryInput = {
  from: ymd.describe("Dönem başlangıcı (dahil)."),
  to: ymd.describe("Dönem bitişi (dahil)."),
  dateBasis: z
    .enum(["scheduled_for", "created_at"])
    .default("scheduled_for")
    .describe("scheduled_for = teslim tarihine göre, created_at = oluşturulma tarihine göre."),
};

export const agendaInput = {
  hafta: ymd
    .optional()
    .describe("Bu tarihi içeren haftayı getirir; boşsa bu hafta. Yapılacaklar listesi (backlog) dahildir."),
};

export const transitionOrderInput = {
  order_id: z.string().uuid(),
  to_status: z.enum(ORDER_STATUSES),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe("İptal (cancelled) için zorunlu; diğer geçişlerde isteğe bağlı."),
};

export const confirmOrdersInput = {
  order_ids: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .describe("Bekleyen (pending) siparişlerin id'leri; hepsi 'confirmed' olur."),
};

export const routeSummaryInput = {
  date: ymd
    .optional()
    .describe("Rota günü (YYYY-AA-GG). Boşsa YARIN (Europe/Istanbul)."),
};
