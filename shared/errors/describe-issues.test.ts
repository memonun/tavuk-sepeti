import { describe, expect, it } from "vitest";

import { describeIssues } from "@/shared/errors/describe-issues";

describe("describeIssues", () => {
  it("names every issue, in order", () => {
    expect(
      describeIssues(
        [{ message: "Ad gerekli." }, { message: "Telefon gerekli." }],
        "Formda eksik alanlar var.",
      ),
    ).toBe("Ad gerekli. Telefon gerekli.");
  });

  it("collapses duplicates", () => {
    expect(
      describeIssues(
        [{ message: "Teslimat adresi seçin." }, { message: "Teslimat adresi seçin." }],
        "x",
      ),
    ).toBe("Teslimat adresi seçin.");
  });

  it("falls back when there is nothing to say", () => {
    expect(describeIssues([], "Formda eksik alanlar var.")).toBe(
      "Formda eksik alanlar var.",
    );
    expect(describeIssues([{ message: "  " }], "fallback")).toBe("fallback");
  });
});
