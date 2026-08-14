/**
 * Regression tests for the checkout's account resolution.
 *
 * These exist because of a production incident: with "Confirm email" ON,
 * Supabase answers a signup for an ALREADY REGISTERED address with HTTP 200 and
 * an obfuscated user — a random id, `identities: []`, no session — instead of an
 * error. The old code trusted that fake user, handed its random id to
 * `link_customer_account`, and the resulting `customers_email_unique_web`
 * collision surfaced to the customer as
 *
 *     "Bu telefon veya e-posta başka bir hesapta kayıtlı."
 *
 * …while they were creating their FIRST account. The `/already|registered/`
 * branch the code thought was handling this is unreachable in that
 * configuration, because `error` is null.
 *
 * So the load-bearing assertion here is not the returned message — it is that
 * `linkCustomerAccount` is NEVER called with an obfuscated user.
 *
 * Follows the repo's mock-then-`await import()` pattern (see place-order.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://shop.example.com" },
}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const signUp = vi.fn();
const signInWithPassword = vi.fn();
const getUser = vi.fn();
vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signUp: (...a: unknown[]) => signUp(...a),
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      getUser: () => getUser(),
    },
  }),
}));

const linkCustomerAccount = vi.fn();
vi.mock(
  "@/features/storefront/infrastructure/customer-account.repository",
  () => ({
    linkCustomerAccount: (...a: unknown[]) => linkCustomerAccount(...a),
  }),
);

const { resolveCheckoutSession } = await import(
  "@/features/storefront/application/checkout-account"
);

const SIGNUP = {
  mode: "signup",
  email: "ayse@example.com",
  password: "supersecret",
  first_name: "Ayşe",
  last_name: "Yılmaz",
  phone: "+905321234567",
  kvkk_accepted: true,
} as const;

/** What Supabase returns for a brand-new signup: one identity, no session yet. */
function freshUser() {
  return {
    data: {
      user: { id: "user-1", identities: [{ id: "ident-1" }] },
      session: null,
    },
    error: null,
  };
}

/** The obfuscated stand-in Supabase returns for an address that already exists. */
function obfuscatedUser() {
  return {
    data: { user: { id: "random-uuid-nobody-owns", identities: [] }, session: null },
    error: null,
  };
}

function authError(message: string, status: number, code?: string) {
  return { data: { user: null, session: null }, error: { message, status, code } };
}

beforeEach(() => {
  vi.clearAllMocks();
  linkCustomerAccount.mockResolvedValue({ ok: true, value: "customer-1" });
  getUser.mockResolvedValue({ data: { user: null } });
});

describe("resolveCheckoutSession — signup", () => {
  it("reports email_taken for an obfuscated user WITHOUT writing a customer row", async () => {
    signUp.mockResolvedValue(obfuscatedUser());

    const result = await resolveCheckoutSession(SIGNUP);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: "email_taken",
      email: "ayse@example.com",
    });
    // The whole point: the random id must never reach the RPC. Calling it is
    // what raised P0005 at a first-time customer.
    expect(linkCustomerAccount).not.toHaveBeenCalled();
  });

  it("creates the CRM row and asks for confirmation on a genuine new signup", async () => {
    signUp.mockResolvedValue(freshUser());

    const result = await resolveCheckoutSession(SIGNUP);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: "verify_email",
      email: "ayse@example.com",
    });
    expect(linkCustomerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: "user-1", phone: "+905321234567" }),
    );
  });

  it("tells the customer to wait, not to retry, when the mail quota is spent", async () => {
    signUp.mockResolvedValue(
      authError("email rate limit exceeded", 429, "over_email_send_rate_limit"),
    );

    const result = await resolveCheckoutSession(SIGNUP);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The generic "Hesap oluşturulamadı, tekrar deneyin." invites an immediate
    // retry, which cannot clear a rate limit — it is what customers did nine
    // times in twenty-two minutes. This case must name the wait instead.
    expect(result.error.message).not.toBe(
      "Hesap oluşturulamadı, tekrar deneyin.",
    );
    expect(result.error.message).toMatch(/birkaç dakika/i);
    expect(linkCustomerAccount).not.toHaveBeenCalled();
  });

  it("still reports email_taken when confirmations are OFF and Supabase errors", async () => {
    signUp.mockResolvedValue(
      authError("User already registered", 422, "user_already_exists"),
    );

    const result = await resolveCheckoutSession(SIGNUP);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ kind: "email_taken" });
  });

  it("sends the confirmation link back to where the signup started", async () => {
    signUp.mockResolvedValue(freshUser());

    await resolveCheckoutSession(SIGNUP, { nextPath: "/odeme" });

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://shop.example.com/odeme",
        }),
      }),
    );
  });
});

describe("resolveCheckoutSession — signin", () => {
  const SIGNIN = {
    mode: "signin",
    email: "ayse@example.com",
    password: "supersecret",
  } as const;

  it("does not call an unconfirmed account a wrong password", async () => {
    signInWithPassword.mockResolvedValue(
      authError("Email not confirmed", 400, "email_not_confirmed"),
    );

    const result = await resolveCheckoutSession(SIGNIN);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Reporting this as a bad password sent people to "şifremi unuttum", which
    // burned another mail out of the same quota.
    expect(result.error.message).not.toMatch(/şifre hatalı/i);
    expect(result.error.message).toMatch(/doğrulanmamış/i);
  });

  it("keeps 'wrong password' and 'no such account' indistinguishable", async () => {
    signInWithPassword.mockResolvedValue(
      authError("Invalid login credentials", 400, "invalid_credentials"),
    );

    const result = await resolveCheckoutSession(SIGNIN);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("E-posta veya şifre hatalı.");
  });
});
