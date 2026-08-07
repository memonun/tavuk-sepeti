import { describe, expect, it } from "vitest";

import {
  fromRestAddressComponents,
  mapGooglePlaceComponents,
  type GoogleAddressComponentLike,
} from "@/shared/geo/tr-address-components";

const comp = (
  types: string[],
  longText: string | null,
): GoogleAddressComponentLike => ({ types, longText });

describe("mapGooglePlaceComponents", () => {
  it("maps the standard TR component set", () => {
    const result = mapGooglePlaceComponents(
      [
        comp(["administrative_area_level_1", "political"], "Malatya"),
        comp(["administrative_area_level_2", "political"], "Battalgazi"),
        comp(["administrative_area_level_4", "political"], "Çavuşoğlu"),
        comp(["route"], "Atatürk Caddesi"),
        comp(["street_number"], "12"),
        comp(["postal_code"], "44100"),
      ],
      { lat: 38.3552, lng: 38.3095 },
    );

    expect(result).toEqual({
      city: "Malatya",
      district: "Battalgazi",
      neighborhood: "Çavuşoğlu",
      street: "Atatürk Caddesi",
      building_no: "12",
      postal_code: "44100",
      lat: 38.3552,
      lng: 38.3095,
    });
  });

  describe("mahalle fallback chain", () => {
    const base = [
      comp(["administrative_area_level_1"], "Malatya"),
      comp(["administrative_area_level_2"], "Yeşilyurt"),
    ];

    it("prefers administrative_area_level_4", () => {
      const r = mapGooglePlaceComponents(
        [
          ...base,
          comp(["administrative_area_level_4"], "Level4 Mah."),
          comp(["neighborhood"], "Neighborhood Mah."),
          comp(["sublocality_level_1"], "Sub1 Mah."),
        ],
        null,
      );
      expect(r.neighborhood).toBe("Level4 Mah.");
    });

    it("falls back to neighborhood", () => {
      const r = mapGooglePlaceComponents(
        [...base, comp(["neighborhood"], "Neighborhood Mah."), comp(["sublocality_level_1"], "Sub1 Mah.")],
        null,
      );
      expect(r.neighborhood).toBe("Neighborhood Mah.");
    });

    it("falls back to sublocality_level_1", () => {
      const r = mapGooglePlaceComponents(
        [...base, comp(["sublocality_level_1"], "Sub1 Mah."), comp(["sublocality_level_2"], "Sub2 Mah.")],
        null,
      );
      expect(r.neighborhood).toBe("Sub1 Mah.");
    });

    it("falls back to sublocality_level_2 last", () => {
      const r = mapGooglePlaceComponents([...base, comp(["sublocality_level_2"], "Sub2 Mah.")], null);
      expect(r.neighborhood).toBe("Sub2 Mah.");
    });

    it("yields an empty mahalle when none is present", () => {
      const r = mapGooglePlaceComponents(base, null);
      expect(r.neighborhood).toBe("");
    });

    // A present-but-empty component must not stop the chain.
    it("skips a component whose longText is null", () => {
      const r = mapGooglePlaceComponents(
        [...base, comp(["administrative_area_level_4"], null), comp(["neighborhood"], "Neighborhood Mah.")],
        null,
      );
      expect(r.neighborhood).toBe("Neighborhood Mah.");
    });
  });

  // (0,0) is the repo's "no pin" sentinel — delivery-readiness reports it as a
  // missing location rather than sending the driver to the Gulf of Guinea.
  it("uses (0,0) when the place carried no location", () => {
    const r = mapGooglePlaceComponents([comp(["administrative_area_level_1"], "Malatya")], null);
    expect(r.lat).toBe(0);
    expect(r.lng).toBe(0);

    const u = mapGooglePlaceComponents([], undefined);
    expect(u.lat).toBe(0);
    expect(u.lng).toBe(0);
  });

  it("returns all-empty fields for an empty component list", () => {
    expect(mapGooglePlaceComponents([], { lat: 1, lng: 2 })).toEqual({
      city: "",
      district: "",
      neighborhood: "",
      street: "",
      building_no: "",
      postal_code: "",
      lat: 1,
      lng: 2,
    });
  });
});

describe("fromRestAddressComponents", () => {
  it("maps the REST long_name shape onto the Places longText shape", () => {
    expect(
      fromRestAddressComponents([
        { types: ["administrative_area_level_1"], long_name: "Malatya" },
        { types: ["route"], long_name: "Atatürk Caddesi" },
      ]),
    ).toEqual([
      { types: ["administrative_area_level_1"], longText: "Malatya" },
      { types: ["route"], longText: "Atatürk Caddesi" },
    ]);
  });

  it("turns a missing long_name into null rather than undefined", () => {
    expect(fromRestAddressComponents([{ types: ["route"] }])).toEqual([
      { types: ["route"], longText: null },
    ]);
  });

  it("feeds straight into the TR mapper", () => {
    // The reverse-geocode path composes exactly these two calls.
    const result = mapGooglePlaceComponents(
      fromRestAddressComponents([
        { types: ["administrative_area_level_1"], long_name: "Malatya" },
        { types: ["administrative_area_level_2"], long_name: "Yeşilyurt" },
        { types: ["neighborhood"], long_name: "Karakavak" },
        { types: ["route"], long_name: "Turgut Özal Bulvarı" },
        { types: ["street_number"], long_name: "7" },
      ]),
      { lat: 38.3552, lng: 38.3095 },
    );

    expect(result).toEqual({
      city: "Malatya",
      district: "Yeşilyurt",
      neighborhood: "Karakavak",
      street: "Turgut Özal Bulvarı",
      building_no: "7",
      postal_code: "",
      lat: 38.3552,
      lng: 38.3095,
    });
  });
});
