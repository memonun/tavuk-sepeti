import { describe, expect, it } from "vitest";

import {
  buildEmptyRouteSummary,
  buildRouteSummary,
  type OffRouteOrder,
  type SummaryManifest,
  type SummaryRoute,
  type SummaryStop,
} from "@/features/mcp/application/route-summary";

const stop = (over: Partial<SummaryStop>): SummaryStop => ({
  sequence: 1,
  order_number: "ORD-1",
  customer_name: "Ayşe Yılmaz",
  customer_phone: "+905321234567",
  address: "Gül Sk. 4/2 Yeşilyurt",
  delivery_notes: null,
  customer_notes: null,
  total_minor: 100000,
  amount_paid_minor: 0,
  items: [{ label: "Dut Kurusu", unit_label: "kg", quantity: 1.5 }],
  in_service_area: true,
  ...over,
});

const manifest: SummaryManifest = {
  loads: [{ label: "Dut Kurusu", unit_label: "kg", quantity: 3 }],
  stopCount: 2,
  totalValueMinor: 250000,
  collectedMinor: 50000,
  toCollectMinor: 200000,
};

const route = (stops: SummaryStop[]): SummaryRoute => ({
  stops,
  completed_markers: [],
  total_distance_m: 42_340,
  total_duration_s: 4_000,
});

const base = { date: "2026-10-08", manifest, offRoute: [] as OffRouteOrder[] };

describe("buildRouteSummary", () => {
  it("reports stops in order with money, items and totals — and no times or geometry", () => {
    const out = buildRouteSummary({
      ...base,
      route: route([
        stop({ sequence: 1, order_number: "A", total_minor: 150000, amount_paid_minor: 50000 }),
        stop({ sequence: 2, order_number: "B" }),
      ]),
    });

    expect(out.durak_sayisi).toBe(2);
    expect(out.toplam_km).toBe(42.3);
    expect(out.surus_dakika).toBe(67);
    expect(out.tahsil_edilecek_minor).toBe(200000);
    expect(out.yuklenecekler).toEqual(["3 kg Dut Kurusu"]);
    expect(out.duraklar.map((s) => s.siparis_no)).toEqual(["A", "B"]);
    expect(out.duraklar[0]).toMatchObject({
      urunler: ["1.5 kg Dut Kurusu"],
      tahsil_edilecek_minor: 100000,
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain("eta");
    expect(json).not.toContain("polyline");
  });

  it("never reports a negative balance for an overpaid stop", () => {
    const out = buildRouteSummary({
      ...base,
      route: route([stop({ total_minor: 100000, amount_paid_minor: 120000 })]),
    });
    expect(out.duraklar[0]?.tahsil_edilecek_minor).toBe(0);
  });

  it("joins delivery and customer notes, and drops blank ones", () => {
    const out = buildRouteSummary({
      ...base,
      route: route([
        stop({ delivery_notes: "Zile basma", customer_notes: "Önce ara" }),
        stop({ sequence: 2, delivery_notes: "  ", customer_notes: null }),
      ]),
    });
    expect(out.duraklar[0]?.not).toBe("Zile basma | Önce ara");
    expect(out.duraklar[1]?.not).toBeNull();
  });

  it("names the orders the route left out, with the reason for an unpaid card order", () => {
    const out = buildRouteSummary({
      ...base,
      route: route([stop({})]),
      offRoute: [
        { order_number: "P-1", customer_name: "Ayşe", payment_method: "credit_card", payment_status: "pending" },
        { order_number: "P-2", customer_name: "Mehmet", payment_method: "cash_on_delivery", payment_status: "pending" },
      ],
    });
    const warning = out.uyarilar.find((w) => w.includes("GİRMEDİ"));
    expect(warning).toContain("2 teslimat siparişi");
    expect(warning).toContain("P-1 (Ayşe, kart ödemesi gelmedi)");
    expect(warning).toContain("P-2 (Mehmet, rotaya girmedi)");
    // The old advice ("confirm them first") was wrong: pending orders ride the route.
    expect(JSON.stringify(out)).not.toContain("confirm_orders");
  });

  it("flags stops outside the service area and stops with no written address", () => {
    const out = buildRouteSummary({
      ...base,
      route: route([
        stop({ order_number: "OUT", in_service_area: false }),
        stop({ sequence: 2, order_number: "NOADDR", address: null }),
        stop({ sequence: 3, order_number: "OK", in_service_area: null }),
      ]),
    });
    expect(out.uyarilar.join(" ")).toContain("OUT");
    expect(out.uyarilar.join(" ")).toContain("NOADDR");
    expect(out.uyarilar.join(" ")).not.toContain("OK,");
  });

  it("has no warnings when everything is routable", () => {
    expect(buildRouteSummary({ ...base, route: route([stop({})]) }).uyarilar).toEqual([]);
  });
});

describe("buildEmptyRouteSummary", () => {
  it("explains there is nothing to route", () => {
    const out = buildEmptyRouteSummary({ date: "2026-10-08", offRoute: [] });
    expect(out.durak_sayisi).toBe(0);
    expect(out.mesaj).toContain("rotaya girecek");
  });

  it("still reports orders the route left out", () => {
    const out = buildEmptyRouteSummary({
      date: "2026-10-08",
      offRoute: [{ order_number: "P-1", customer_name: "Ayşe", payment_method: "credit_card", payment_status: "pending" }],
    });
    expect(out.mesaj).toContain("P-1 (Ayşe, kart ödemesi gelmedi)");
    expect(out.mesaj).not.toContain("confirm_orders");
  });
});
