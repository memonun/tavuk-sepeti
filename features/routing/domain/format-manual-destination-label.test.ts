import { describe, expect, it } from "vitest";

import { formatManualDestinationLabel } from "@/features/routing/domain/format-manual-destination-label";

describe("formatManualDestinationLabel", () => {
  it("joins the non-empty parts, most specific first", () => {
    expect(
      formatManualDestinationLabel({
        street: "İstasyon Cad.",
        neighborhood: "Yeşilyurt",
        district: "Yeşilyurt",
        city: "Malatya",
      }),
    ).toBe("İstasyon Cad., Yeşilyurt, Yeşilyurt, Malatya");
  });

  it("skips blank parts", () => {
    expect(
      formatManualDestinationLabel({
        street: "",
        neighborhood: "",
        district: "Battalgazi",
        city: "Malatya",
      }),
    ).toBe("Battalgazi, Malatya");
  });

  it("falls back to a generic label when nothing is on file", () => {
    expect(
      formatManualDestinationLabel({ street: "", neighborhood: "", district: "", city: "" }),
    ).toBe("Elle girilen adres");
  });

  it("treats whitespace-only parts as blank", () => {
    expect(
      formatManualDestinationLabel({
        street: "  ",
        neighborhood: "Merkez",
        district: "",
        city: "Malatya",
      }),
    ).toBe("Merkez, Malatya");
  });
});
