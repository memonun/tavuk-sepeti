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

export function buildRouteSummary(input: {
  date: string;
  route: SummaryRoute;
  manifest: SummaryManifest;
  pendingOrderNumbers: readonly string[];
  pendingTotal: number;
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
  if (input.pendingTotal > 0) {
    const shown = input.pendingOrderNumbers.join(", ");
    const more = input.pendingTotal > input.pendingOrderNumbers.length ? " …" : "";
    warnings.push(
      `${input.pendingTotal} bekleyen (onaysız) sipariş rotaya DAHİL DEĞİL: ${shown}${more}. Dahil etmek için önce confirm_orders ile onaylayın.`,
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

/** The "nothing to route" answer — still reports what is waiting for confirmation. */
export function buildEmptyRouteSummary(input: {
  date: string;
  pendingOrderNumbers: readonly string[];
  pendingTotal: number;
}) {
  return {
    tarih: input.date,
    durak_sayisi: 0,
    mesaj:
      input.pendingTotal > 0
        ? `Bu gün için ONAYLI sipariş yok, ama ${input.pendingTotal} bekleyen sipariş var: ${input.pendingOrderNumbers.join(", ")}${
            input.pendingTotal > input.pendingOrderNumbers.length ? " …" : ""
          }. Rotaya girmeleri için önce confirm_orders ile onaylayın.`
        : "Bu gün için rotaya girecek (onaylı, teslimat kanallı) sipariş yok.",
  };
}
