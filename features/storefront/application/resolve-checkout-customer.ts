import "server-only";

/**
 * The ONE place that answers "which `customers` row is this checkout for?".
 *
 * It answers it from the LOGIN and nothing else. There is no phone lookup, no
 * email lookup and no merge — that is the owner's requirement in a single
 * function:
 *
 *   "hali hazırda olan bilgiler ve müşteriler olduğu gibi kalsın, onları
 *    matchlemekle uğraşmayalım — websitesinden gelen hesaplar db'de hiç
 *    yokmuş gibi sıfırdan yazılsın."
 *
 * The previous design did the opposite: `place_web_order` upserted `customers`
 * ON CONFLICT (phone), so any guest checkout silently attached itself to
 * whichever legacy phone-ordered record happened to share the number.
 *
 * Keeping the resolution in one narrow module is what makes that regression
 * testable — see resolve-checkout-customer.test.ts, which asserts no
 * lookup-by-phone call is ever issued.
 */
import { linkCustomerAccount } from "@/features/storefront/infrastructure/customer-account.repository";
import { AppError, UnauthorizedError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

export interface CheckoutIdentity {
  authUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

/**
 * Returns the customer id for a signed-in storefront user, creating the row on
 * first use. Idempotent: `link_customer_account` returns the existing row when
 * the login already has one and only backfills fields that are still null.
 */
export async function resolveCheckoutCustomer(
  identity: CheckoutIdentity,
): Promise<Result<string, AppError>> {
  if (!identity.authUserId) {
    return err(
      new UnauthorizedError({ message: "Sipariş vermek için giriş yapın." }),
    );
  }

  return linkCustomerAccount({
    authUserId: identity.authUserId,
    firstName: identity.firstName,
    lastName: identity.lastName,
    phone: identity.phone,
    email: identity.email,
  });
}
