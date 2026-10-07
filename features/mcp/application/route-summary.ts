/**
 * Pure shaping of a day's route into the short summary the connector returns.
 * Kept free of I/O so it is unit-tested directly: the route object carries map
 * geometry (polylines) and per-stop ETAs that a chat answer does not need — the
 * summary keeps who/where/how much/in what order, not when.
 */

export interface SummaryStop {
  readonly sequence: number;
  readonly order_number: string;
  readonly customer_name: string;
  readonly customer_phone: string | null;
  readonly address: string | null;
  readonly delivery_notes: string | null;
  readonly customer_notes: string | null;
  readonly total_minor: number;
  readonly amount_paid_minor: number;
  readonly items: ReadonlyArray<{ label: string; unit_label: string; quantity: number }>;
  readonly in_service_area: boolean | null;
}

export interface SummaryRoute {
  readonly stops: readonly SummaryStop[];
  readonly completed_markers: readonly unknown[];
  readonly total_distance_m: number;
  readonly total_duration_s: number;
}

export interface SummaryManifest {
  readonly loads: ReadonlyArray<{ label: string; unit_label: string; quantity: number }>;
  readonly stopCount: number;
  readonly totalValueMinor: number;
  readonly collectedMinor: number;
  readonly toCollectMinor: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : String(round1(q));
}

/**
 * A delivery order for the day that the route did NOT pick up. The panel's route
 * query takes pending, confirmed and delivered delivery-channel orders; what it
 * leaves out is a card order whose payment has not arrived (an abandoned or
 * declined checkout — see migration 20260808120100), so that is the one reason
 * worth naming.
 */
export interface OffRouteOrder {
  readonly order_number: string;
  readonly customer_name: string;
  readonly payment_method: string;
  readonly payment_status: string;
}

export function describeOffRoute(order: OffRouteOrder): string {
  const reason =
    order.payment_method === "credit_card" && order.payment_status !== "paid"
      ? "kart ödemesi gelmedi"
      : "rotaya girmedi";
  return `${order.order_number} (${order.customer_name}, ${reason})`;
}

export function buildRouteSummary(input: {
  date: string;
  route: SummaryRoute;
  manifest: SummaryManifest;
  offRoute: readonly OffRouteOrder[];
}) {
  const { route, manifest } = input;

  const stops = route.stops.map((s) => ({
    sira: s.sequence,
    siparis_no: s.order_number,
    musteri: s.customer_name,
    telefon: s.customer_phone,
    adres: s.address,
    not: [s.delivery_notes, s.customer_notes].filter((n): n is string => !!n && n.trim() !== "").join(" | ") || null,
    urunler: s.items.map((i) => `${formatQty(i.quantity)} ${i.unit_label} ${i.label}`),
    tutar_minor: s.total_minor,
    odenen_minor: s.amount_paid_minor,
    tahsil_edilecek_minor: Math.max(0, s.total_minor - s.amount_paid_minor),
  }));

  const warnings: string[] = [];
  const outside = route.stops.filter((s) => s.in_service_area === false).map((s) => s.order_number);
  if (outside.length > 0) warnings.push(`Teslimat bölgesi dışında görünen siparişler: ${outside.join(", ")}.`);
  const noAddress = route.stops.filter((s) => !s.address).map((s) => s.order_number);
  if (noAddress.length > 0) warnings.push(`Yazılı adresi olmayan siparişler: ${noAddress.join(", ")}.`);
  if (input.offRoute.length > 0) {
    warnings.push(
      `Bu güne ait ${input.offRoute.length} teslimat siparişi rotaya GİRMEDİ: ${input.offRoute
        .map(describeOffRoute)
        .join("; ")}.`,
    );
  }

  return {
    tarih: input.date,
    durak_sayisi: stops.length,
    toplam_km: round1(route.total_distance_m / 1000),
    surus_dakika: Math.round(route.total_duration_s / 60),
    toplam_tutar_minor: manifest.totalValueMinor,
    tahsil_edilmis_minor: manifest.collectedMinor,
    tahsil_edilecek_minor: manifest.toCollectMinor,
    yuklenecekler: manifest.loads.map((l) => `${formatQty(l.quantity)} ${l.unit_label} ${l.label}`),
    duraklar: stops,
    ...(route.completed_markers.length > 0 ? { teslim_edilmis_durak: route.completed_markers.length } : {}),
    uyarilar: warnings,
    not: "Sıra, Google Routes ile hesaplanan optimum sıradır. Saatler hesaplanmadı/yazılmadı; müşteriye gösterilen teslimat saatleri değişmedi.",
  };
}

/** The "nothing to route" answer — still reports orders the route left out. */
export function buildEmptyRouteSummary(input: { date: string; offRoute: readonly OffRouteOrder[] }) {
  return {
    tarih: input.date,
    durak_sayisi: 0,
    mesaj:
      input.offRoute.length > 0
        ? `Bu gün için rotaya girecek sipariş yok. Rotaya girmeyen ${input.offRoute.length} sipariş var: ${input.offRoute
            .map(describeOffRoute)
            .join("; ")}.`
        : "Bu gün için rotaya girecek (teslimat kanallı) sipariş yok.",
  };
}
