import { describe, expect, it } from "vitest";

import { composeArasLabel } from "@/features/cargo/domain/aras-label";

describe("composeArasLabel", () => {
  it("fills the template fields, dating it in Istanbul time", () => {
    // 21:30 UTC on 26 Oct is already 27 Oct in Istanbul (UTC+3).
    expect(
      composeArasLabel({
        integrationCode: "26081800477",
        firstName: "Ayşe",
        lastName: "  Yılmaz ",
        printedAt: new Date("2026-10-26T21:30:00Z"),
      }),
    ).toEqual({
      date: "27.10.2026",
      sender: "Apuhan Çiftliği",
      receiver: "Ayşe Yılmaz",
      integrationCode: "26081800477",
      accountSelection: "Apuhan Çiftliği Sipariş Bazlı",
    });
  });

  it("shows a dash when no name is on file", () => {
    expect(
      composeArasLabel({
        integrationCode: "1234",
        firstName: null,
        lastName: " ",
        printedAt: new Date("2026-10-26T09:00:00Z"),
      }).receiver,
    ).toBe("—");
  });
});
