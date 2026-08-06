/**
 * Regression guard for the owner's hard requirement: a storefront checkout must
 * NEVER attach itself to an existing customer record by phone or email.
 *
 * The old `place_web_order` upserted `customers` ON CONFLICT (phone), so a guest
 * checkout silently merged into whichever legacy phone-ordered row shared the
 * number. This test exists so that behaviour cannot come back by accident: it
 * asserts the resolver reaches for exactly one repository function — the
 * create-or-return-by-login one — and never a lookup by phone/email.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const linkCustomerAccount = vi.fn();

// The whole repository surface is mocked. Anything the resolver reaches for that
// is NOT linkCustomerAccount shows up here as an extra spy call.
const findByPhone = vi.fn();
const findByEmail = vi.fn();

vi.mock(
  "@/features/storefront/infrastructure/customer-account.repository",
  () => ({
    linkCustomerAccount: (...args: unknown[]) => linkCustomerAccount(...args),
    findCustomerByPhone: (...args: unknown[]) => findByPhone(...args),
    findCustomerByEmail: (...args: unknown[]) => findByEmail(...args),
    updateCustomerProfile: vi.fn(),
    upsertCustomerAddress: vi.fn(),
    deleteCustomerAddress: vi.fn(),
  }),
);

const { resolveCheckoutCustomer } = await import(
  "@/features/storefront/application/resolve-checkout-customer"
);

const identity = {
  authUserId: "auth-user-1",
  email: "ayse@example.com",
  firstName: "Ayşe",
  lastName: "Yılmaz",
  phone: "+905321234567",
};

beforeEach(() => {
  vi.clearAllMocks();
  linkCustomerAccount.mockResolvedValue({ ok: true, value: "customer-1" });
});

describe("resolveCheckoutCustomer", () => {
  it("resolves the customer from the login", async () => {
    const result = await resolveCheckoutCustomer(identity);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe("customer-1");
    expect(linkCustomerAccount).toHaveBeenCalledWith({
      authUserId: "auth-user-1",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      phone: "+905321234567",
      email: "ayse@example.com",
    });
  });

  // THE regression guard. If someone reintroduces "find the existing customer
  // with this phone and reuse it", this fails.
  it("never looks a customer up by phone or email", async () => {
    await resolveCheckoutCustomer(identity);

    expect(findByPhone).not.toHaveBeenCalled();
    expect(findByEmail).not.toHaveBeenCalled();
    expect(linkCustomerAccount).toHaveBeenCalledTimes(1);
  });

  it("still resolves when the account has no phone on file", async () => {
    const result = await resolveCheckoutCustomer({ ...identity, phone: null });

    expect(result.ok).toBe(true);
    expect(findByPhone).not.toHaveBeenCalled();
    expect(linkCustomerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    );
  });

  it("refuses without a login instead of falling back to phone identity", async () => {
    const result = await resolveCheckoutCustomer({ ...identity, authUserId: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
    expect(linkCustomerAccount).not.toHaveBeenCalled();
    expect(findByPhone).not.toHaveBeenCalled();
  });

  it("propagates a phone-already-registered rejection rather than nulling it", async () => {
    linkCustomerAccount.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Bu telefon ... kayıtlı." },
    });

    const result = await resolveCheckoutCustomer(identity);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});
