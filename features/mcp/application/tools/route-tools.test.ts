import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ExternalApiError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { err, ok } from "@/shared/result";
import { addDaysToYmd, todayInIstanbul } from "@/shared/utils/date";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const listOrders = vi.fn();
const getDayOrders = vi.fn();
const getDayRoute = vi.fn();
const buildDayLoadManifest = vi.fn();
vi.mock("@/features/orders/application/list-orders", () => ({ listOrders: (...a: unknown[]) => listOrders(...a) }));
vi.mock("@/features/routing/application/get-day-orders", () => ({ getDayOrders: (...a: unknown[]) => getDayOrders(...a) }));
vi.mock("@/features/routing/application/get-day-route", () => ({ getDayRoute: (...a: unknown[]) => getDayRoute(...a) }));
vi.mock("@/features/routing/application/get-day-load-manifest", () => ({
  buildDayLoadManifest: (...a: unknown[]) => buildDayLoadManifest(...a),
}));

const { registerRouteTools } = await import("@/features/mcp/application/tools/route-tools");

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "t", version: "0" });
  registerRouteTools(server);
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "c", version: "0" });
  await client.connect(c);
  return client;
}

const body = (r: unknown) =>
  JSON.parse((r as { content: Array<{ text?: string }> }).content[0]?.text ?? "{}") as Record<string, unknown>;

const TOMORROW = () => addDaysToYmd(todayInIstanbul(), 1);

const oneStopRoute = {
  stops: [
    {
      sequence: 1,
      order_number: "ORD-1",
      customer_name: "Ayşe Yılmaz",
      customer_phone: null,
      delivery_address: "Gül Sk. 4",
      delivery_notes: null,
      customer_notes: null,
      total_minor: 100000,
      amount_paid_minor: 0,
      items: [{ label: "Dut Kurusu", unit_label: "kg", quantity: 1 }],
      in_service_area: true,
      eta_iso: "2026-10-08T07:00:00.000Z",
    },
  ],
  completed_markers: [],
  total_distance_m: 5000,
  total_duration_s: 600,
  step_polylines: ["very-long-geometry"],
};

describe("get_route_summary", () => {
  beforeEach(() => {
    for (const fn of [listOrders, getDayOrders, getDayRoute, buildDayLoadManifest]) fn.mockReset();
    listOrders.mockResolvedValue(ok({ items: [], total: 0, page: 1, pageSize: 20 }));
  });

  it("is a read-only tool that is flagged as reaching an external API", async () => {
    const { tools } = await (await connect()).listTools();
    const tool = tools.find((t) => t.name === "get_route_summary");
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });

  it("defaults to tomorrow, never persists ETAs, and returns a trimmed summary", async () => {
    getDayOrders.mockResolvedValue(ok([{ order_id: "o1", total_minor: 100000, status: "confirmed" }]));
    getDayRoute.mockResolvedValue(ok(oneStopRoute));
    buildDayLoadManifest.mockResolvedValue({
      loads: [{ label: "Dut Kurusu", unit_label: "kg", quantity: 1 }],
      stopCount: 1,
      totalValueMinor: 100000,
      collectedMinor: 0,
      toCollectMinor: 100000,
    });

    const res = await (await connect()).callTool({ name: "get_route_summary", arguments: {} });

    expect(getDayRoute).toHaveBeenCalledWith(TOMORROW(), { persistEtas: false });
    const out = body(res);
    expect(out.tarih).toBe(TOMORROW());
    expect(out.durak_sayisi).toBe(1);
    expect(JSON.stringify(out)).not.toContain("very-long-geometry");
    expect(JSON.stringify(out)).not.toContain("2026-10-08T07");
  });

  it("uses the date it is given", async () => {
    getDayOrders.mockResolvedValue(ok([{ order_id: "o1", total_minor: 1, status: "confirmed" }]));
    getDayRoute.mockResolvedValue(ok(oneStopRoute));
    buildDayLoadManifest.mockResolvedValue({ loads: [], stopCount: 1, totalValueMinor: 1, collectedMinor: 0, toCollectMinor: 1 });
    await (await connect()).callTool({ name: "get_route_summary", arguments: { date: "2026-11-02" } });
    expect(getDayRoute).toHaveBeenCalledWith("2026-11-02", { persistEtas: false });
  });

  it("does not call Google when there are no confirmed orders, and lists the pending ones", async () => {
    getDayOrders.mockResolvedValue(ok([]));
    listOrders.mockResolvedValue(
      ok({ items: [{ order_number: "P-1" }, { order_number: "P-2" }], total: 2, page: 1, pageSize: 20 }),
    );
    const out = body(await (await connect()).callTool({ name: "get_route_summary", arguments: {} }));
    expect(getDayRoute).not.toHaveBeenCalled();
    expect(out.durak_sayisi).toBe(0);
    expect(String(out.mesaj)).toContain("P-1, P-2");
  });

  it("treats the optimiser's 'no confirmed orders' (NOT_FOUND) as an empty day, not an error", async () => {
    getDayOrders.mockResolvedValue(ok([{ order_id: "o1", total_minor: 1, status: "delivered" }]));
    getDayRoute.mockResolvedValue(err(new AppError(ErrorCode.NOT_FOUND, { message: "Bu gün için onaylı sipariş yok." })));
    const res = await (await connect()).callTool({ name: "get_route_summary", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(body(res).durak_sayisi).toBe(0);
  });

  it("masks a Google/DB failure instead of leaking its message", async () => {
    getDayOrders.mockResolvedValue(ok([{ order_id: "o1", total_minor: 1, status: "confirmed" }]));
    getDayRoute.mockResolvedValue(err(new ExternalApiError({ message: "GOOGLE_KEY_abc123 quota exceeded" })));
    const res = await (await connect()).callTool({ name: "get_route_summary", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).not.toContain("GOOGLE_KEY");
  });

  it("rejects a malformed date before doing any work", async () => {
    const res = await (await connect()).callTool({ name: "get_route_summary", arguments: { date: "yarin" } });
    expect(res.isError).toBe(true);
    expect(getDayOrders).not.toHaveBeenCalled();
  });
});
