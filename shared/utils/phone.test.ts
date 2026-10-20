import { describe, expect, it } from "vitest";

import { formatTRPhoneInput, normalizeTRPhone } from "@/shared/utils/phone";

describe("formatTRPhoneInput", () => {
  it("groups a national number as it is typed", () => {
    expect(formatTRPhoneInput("0")).toBe("0");
    expect(formatTRPhoneInput("0532")).toBe("0532");
    expect(formatTRPhoneInput("05321")).toBe("0532 1");
    expect(formatTRPhoneInput("0532123")).toBe("0532 123");
    expect(formatTRPhoneInput("053212345")).toBe("0532 123 45");
    expect(formatTRPhoneInput("05321234567")).toBe("0532 123 45 67");
  });

  it("regroups a number typed or pasted with other separators", () => {
    expect(formatTRPhoneInput("0 (532) 123-45-67")).toBe("0532 123 45 67");
    expect(formatTRPhoneInput("0532 123 45 67")).toBe("0532 123 45 67");
  });

  it("keeps a +90 prefix", () => {
    expect(formatTRPhoneInput("+")).toBe("+");
    expect(formatTRPhoneInput("+90")).toBe("+90");
    expect(formatTRPhoneInput("+905")).toBe("+90 5");
    expect(formatTRPhoneInput("+905321234567")).toBe("+90 532 123 45 67");
  });

  it("groups a number typed without a prefix", () => {
    expect(formatTRPhoneInput("5321234567")).toBe("532 123 45 67");
  });

  it("stops at a full number's length", () => {
    expect(formatTRPhoneInput("053212345678")).toBe("0532 123 45 67");
  });

  it("clears to empty", () => {
    expect(formatTRPhoneInput("")).toBe("");
    expect(formatTRPhoneInput("  ")).toBe("");
  });

  it("never changes what normalizeTRPhone stores", () => {
    for (const raw of ["05321234567", "+905321234567", "5321234567"]) {
      expect(normalizeTRPhone(formatTRPhoneInput(raw))).toBe(normalizeTRPhone(raw));
    }
  });
});
