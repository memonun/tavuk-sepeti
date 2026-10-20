"use server";

/**
 * Checkout, guest: what will the address a guest just typed do to their order?
 *
 * A signed-in customer's checkout knows this from the address book — every saved
 * address carries `geo_verified`, so the form can tell up front whether a
 * flexible-only basket (kayısı, kuru dut…) rides the van to it. A guest's address
 * exists only in the browser until the order goes in, and the deciding half of
 * that rule is a PostGIS "inside the service area" answer the browser cannot
 * compute. Without asking, the form kept showing a Malatya guest the cargo floor
 * and no delivery day, while `placeOrderAction` and the RPC both treat the same
 * address as a delivery order.
 *
 * So the form asks here, once per collected address. It runs the exact
 * validation `placeOrderAction` will run on submit (`validateCheckoutAddress`,
 * same form shape), which also surfaces a bad address — outside the area, an
 * approximate pin — at "Bu adresi kullan" instead of at the final button.
 *
 * Read-only: nothing is written, and no Google call is made (the area check is a
 * PostGIS query). The answer is a UI hint; the submit re-derives it.
 */
import { validateCheckoutAddress } from "@/features/storefront/application/validate-checkout-address";
import { addressModeSchema } from "@/features/storefront/domain/customer-address.schema";
import { isRouteUpgradeEligible } from "@/features/storefront/domain/route-capability";

export type GuestAddressCheck =
  /** `routeUpgrade`: a flexible-only basket becomes a delivery order. */
  | { status: "ok"; routeUpgrade: boolean }
  | { status: "invalid"; message: string };

export async function checkGuestAddressAction(
  mode: unknown,
  address: unknown,
): Promise<GuestAddressCheck> {
  const parsedMode = addressModeSchema.safeParse(mode);
  if (!parsedMode.success) {
    return { status: "invalid", message: "Adres bilgileri eksik." };
  }

  const validated = await validateCheckoutAddress(parsedMode.data, address);
  if (!validated.ok) {
    return { status: "invalid", message: validated.error.message };
  }

  return {
    status: "ok",
    routeUpgrade: isRouteUpgradeEligible({
      ...validated.value.address,
      geo_verified: validated.value.geoVerified,
    }),
  };
}
