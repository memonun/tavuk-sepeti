/**
 * Two panel customers may share a phone number, but only on purpose: create /
 * update stop with `phone_in_use` (naming who has it) until the admin confirms
 * "Yine de ekle". An inline grid edit has nowhere to ask, so it stays protective.
 *
 * Mock-then-`await import()` pattern, as in get-order-detail-action.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/shared/result";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/cache/invalidate-tag", () => ({ invalidateCacheTag: vi.fn() }));
vi.mock("@/shared/audit/log-audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/features/customers/application/get-filter-options", () => ({
  CUSTOMER_FILTER_TAG: "customer-filter",
}));
vi.mock("@/features/auth/application/get-session", () => ({
  getCurrentUser: async () => ({ id: "admin-1" }),
}));
vi.mock("@/features/auth/application/assert-admin", () => ({
  assertAdmin: async () => ok({ id: "admin-1" }),
}));

const repo = {
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  findCustomerById: vi.fn(),
  findCustomersByPhone: vi.fn(),
  patchCustomerCell: vi.fn(),
};
vi.mock("@/features/customers/infrastructure/customer.repository", () => ({
  createCustomer: (...a: unknown[]) => repo.createCustomer(...a),
  updateCustomer: (...a: unknown[]) => repo.updateCustomer(...a),
  findCustomerById: (...a: unknown[]) => repo.findCustomerById(...a),
  findCustomersByPhone: (...a: unknown[]) => repo.findCustomersByPhone(...a),
  patchCustomerCell: (...a: unknown[]) => repo.patchCustomerCell(...a),
}));

const { createCustomerAction } = await import("./create-customer");
const { updateCustomerAction } = await import("./update-customer");
const { patchCustomerCellAction } = await import("./patch-customer-cell");

const CUSTOMER_ID = "11111111-2222-4333-8444-555555555555";
const PHONE = "+905321234567";

const saved = { id: CUSTOMER_ID, first_name: "Ali", last_name: "Veli", status: "active", phone: PHONE, address: null };

function form(phone: string, confirm = false): FormData {
  const fd = new FormData();
  fd.set("first_name", "Ali");
  fd.set("last_name", "Veli");
  fd.set("email", "");
  fd.set("phone", phone);
  fd.set("notes", "");
  fd.set("status", "active");
  fd.set("address.city", "Malatya");
  fd.set("address.lat", "38.35");
  fd.set("address.lng", "38.31");
  fd.set("address.source", "admin_corrected");
  fd.set("address.accuracy", "rooftop");
  if (confirm) fd.set("confirm_duplicate_phone", "true");
  return fd;
}

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.createCustomer.mockResolvedValue(ok(saved));
  repo.updateCustomer.mockResolvedValue(ok(saved));
  repo.findCustomerById.mockResolvedValue(ok({ ...saved, phone: "+905550000000" }));
  repo.findCustomersByPhone.mockResolvedValue(ok([]));
  repo.patchCustomerCell.mockResolvedValue(ok({ id: CUSTOMER_ID }));
});

const holder = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", first_name: "Ayşe", last_name: "Turhan" };

describe("createCustomerAction — duplicate phone", () => {
  it("creates the customer when nobody has the number", async () => {
    const res = await createCustomerAction({ status: "idle" }, form("0532 123 45 67"));
    expect(res.status).toBe("success");
    expect(repo.findCustomersByPhone).toHaveBeenCalledWith(PHONE, undefined);
    expect(repo.createCustomer).toHaveBeenCalledTimes(1);
  });

  it("stops and names who has the number — nothing is created", async () => {
    repo.findCustomersByPhone.mockResolvedValue(ok([holder]));
    const res = await createCustomerAction({ status: "idle" }, form("0532 123 45 67"));
    expect(res).toEqual({ status: "phone_in_use", holders: [{ id: holder.id, name: "Ayşe Turhan" }] });
    expect(repo.createCustomer).not.toHaveBeenCalled();
  });

  it("names a holder without a name as an unnamed customer", async () => {
    repo.findCustomersByPhone.mockResolvedValue(ok([{ id: holder.id, first_name: null, last_name: null }]));
    const res = await createCustomerAction({ status: "idle" }, form("0532 123 45 67"));
    expect(res).toMatchObject({ status: "phone_in_use", holders: [{ name: "İsimsiz müşteri" }] });
  });

  it("creates it anyway once the admin confirms (Yine de ekle)", async () => {
    repo.findCustomersByPhone.mockResolvedValue(ok([holder]));
    const res = await createCustomerAction({ status: "idle" }, form("0532 123 45 67", true));
    expect(res.status).toBe("success");
    expect(repo.createCustomer).toHaveBeenCalledTimes(1);
  });

  it("does not look anything up for a customer without a phone", async () => {
    const res = await createCustomerAction({ status: "idle" }, form(""));
    expect(res.status).toBe("success");
    expect(repo.findCustomersByPhone).not.toHaveBeenCalled();
  });
});

describe("updateCustomerAction — duplicate phone", () => {
  it("does not warn when the number is unchanged, even if it is shared", async () => {
    repo.findCustomerById.mockResolvedValue(ok({ ...saved, phone: PHONE }));
    repo.findCustomersByPhone.mockResolvedValue(ok([holder]));
    const res = await updateCustomerAction(CUSTOMER_ID, { status: "idle" }, form("0532 123 45 67"));
    expect(res.status).toBe("success");
    expect(repo.findCustomersByPhone).not.toHaveBeenCalled();
  });

  it("warns when the number is changed to one another customer has (not counting itself)", async () => {
    repo.findCustomersByPhone.mockResolvedValue(ok([holder]));
    const res = await updateCustomerAction(CUSTOMER_ID, { status: "idle" }, form("0532 123 45 67"));
    expect(res).toMatchObject({ status: "phone_in_use", holders: [{ name: "Ayşe Turhan" }] });
    expect(repo.findCustomersByPhone).toHaveBeenCalledWith(PHONE, CUSTOMER_ID);
    expect(repo.updateCustomer).not.toHaveBeenCalled();
  });

  it("saves it once the admin confirms (Yine de kaydet)", async () => {
    repo.findCustomersByPhone.mockResolvedValue(ok([holder]));
    const res = await updateCustomerAction(CUSTOMER_ID, { status: "idle" }, form("0532 123 45 67", true));
    expect(res.status).toBe("success");
    expect(repo.updateCustomer).toHaveBeenCalledTimes(1);
  });
});

describe("patchCustomerCellAction — inline phone edit", () => {
  it("refuses a number another customer has and points at the customer card", async () => {
    repo.findCustomersByPhone.mockResolvedValue(ok([holder]));
    const res = await patchCustomerCellAction(CUSTOMER_ID, { field: "phone", value: "0532 123 45 67" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("Ayşe Turhan");
    expect(res.error.message).toContain("Yine de kaydet");
    expect(repo.patchCustomerCell).not.toHaveBeenCalled();
  });

  it("saves a number nobody else has", async () => {
    const res = await patchCustomerCellAction(CUSTOMER_ID, { field: "phone", value: "0532 123 45 67" });
    expect(res.ok).toBe(true);
    expect(repo.patchCustomerCell).toHaveBeenCalledTimes(1);
  });
});
