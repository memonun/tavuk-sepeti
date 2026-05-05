/**
 * MapPin — the projection rendered on the admin map. Decoupled from
 * Customer so an order pin (Faz 5) can later share the same shape.
 *
 * Status is omitted intentionally: the underlying RPC filters to active
 * customers only, so every pin's status is implicit. Adding it would
 * cross feature boundaries (map → customers/domain) for no current gain.
 */
export interface MapPin {
  readonly customer_id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly phone: string;
  readonly lat: number;
  readonly lng: number;
  readonly has_recent_order: boolean;
}

export interface MapFilters {
  readonly recentOrdersOnly: boolean;
}
