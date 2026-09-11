import { describe, expect, it } from "vitest";

import { AppError, ValidationError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";

describe("AppError", () => {
  it("is NOT an Error instance — a Result<T, AppError> returned from a", () => {
    // "use server" action crosses the React Flight boundary; React/Next.js
    // sanitizes any instanceof-Error value in that payload in production,
    // replacing .message with a generic digest message. See the class doc.
    const error = new AppError(ErrorCode.VALIDATION_ERROR, { message: "x" });
    expect(error instanceof Error).toBe(false);
  });

  it("carries message/code/details as plain enumerable fields", () => {
    const error = new ValidationError({ message: "Geçersiz.", details: { field: "phone" } });
    // JSON.stringify(new Error("x")) is famously "{}" — message is
    // non-enumerable on a real Error. Confirm this class doesn't inherit
    // that footgun: every field must round-trip through JSON.
    const json = JSON.parse(JSON.stringify(error));
    expect(json).toEqual({
      name: "ValidationError",
      message: "Geçersiz.",
      code: ErrorCode.VALIDATION_ERROR,
      details: { field: "phone" },
    });
  });

  it("AppError.is recognizes an instance by shape, not instanceof Error", () => {
    const error = new ValidationError({ message: "x" });
    expect(AppError.is(error)).toBe(true);
    expect(AppError.is(new Error("plain"))).toBe(false);
    expect(AppError.is(null)).toBe(false);
    expect(AppError.is("not an error")).toBe(false);
  });
});
