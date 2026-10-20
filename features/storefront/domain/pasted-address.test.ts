import { describe, expect, it } from "vitest";

import { parsePastedAddress } from "@/features/storefront/domain/pasted-address";
import { findTurkishProvince, TR_PROVINCES } from "@/shared/geo/tr-province";

describe("parsePastedAddress", () => {
  it("splits the common one-line form", () => {
    expect(parsePastedAddress("Fırat Mah. 19. Sk. No:39/3 44320 Battalgazi/Malatya")).toEqual({
      neighborhood: "Fırat",
      street: "19. Sk.",
      building_no: "39",
      apartment_no: "3",
      postal_code: "44320",
      district: "Battalgazi",
      city: "Malatya",
    });
  });

  it("reads written-out keywords, Daire and a spaced slash", () => {
    expect(
      parsePastedAddress("Emek Mahallesi 20. Sokak No: 25 Daire: 10 Çankaya / Ankara"),
    ).toEqual({
      neighborhood: "Emek",
      street: "20. Sokak",
      building_no: "25",
      apartment_no: "10",
      district: "Çankaya",
      city: "Ankara",
    });
  });

  it("handles street first, 'No 12 D 3' and the province at the end without a slash", () => {
    expect(
      parsePastedAddress("Atatürk Cad. No 12 D 3, Çavuşoğlu Mh. Battalgazi Malatya"),
    ).toEqual({
      street: "Atatürk Cad.",
      building_no: "12",
      apartment_no: "3",
      neighborhood: "Çavuşoğlu",
      district: "Battalgazi",
      city: "Malatya",
    });
  });

  it("reads several lines and tidies an all-caps address", () => {
    expect(
      parsePastedAddress("İNÖNÜ MAH. GAZİ CAD.\nNO:5 KAT:2 DAİRE:7\nYEŞİLYURT/MALATYA"),
    ).toEqual({
      neighborhood: "İnönü",
      street: "Gazi Cad.",
      building_no: "5",
      apartment_no: "7",
      description: "Kat 2",
      district: "Yeşilyurt",
      city: "Malatya",
    });
  });

  it("does not take a street named after a province for the city", () => {
    expect(parsePastedAddress("Ankara Cad. No:5 Kızılay Mah. Çankaya/Ankara")).toEqual({
      street: "Ankara Cad.",
      building_no: "5",
      neighborhood: "Kızılay",
      district: "Çankaya",
      city: "Ankara",
    });
    expect(parsePastedAddress("İstanbul Cad. No:5").city).toBeUndefined();
  });

  it("keeps a cadde and the sokak off it together, glued dots included", () => {
    expect(parsePastedAddress("Bahçe Mah. İstasyon Cad. 3.Sk. No:4 Merkez/Malatya")).toMatchObject({
      street: "İstasyon Cad. 3. Sk.",
      building_no: "4",
      district: "Merkez",
      city: "Malatya",
    });
  });

  it("puts what it cannot place into the description instead of dropping it", () => {
    expect(
      parsePastedAddress("Güneş Sitesi B Blok, Fırat Mah. 19. Sk. No:39 Battalgazi/Malatya Türkiye"),
    ).toMatchObject({ description: "Güneş Sitesi B Blok", city: "Malatya" });
  });

  it("does not read a place name that merely starts with D as a flat number", () => {
    expect(parsePastedAddress("Darende Malatya").apartment_no).toBeUndefined();
  });

  it("returns nothing for text that is not an address", () => {
    expect(parsePastedAddress("")).toEqual({});
    expect(parsePastedAddress("   ,  ")).toEqual({});
  });
});

describe("findTurkishProvince", () => {
  it("knows all 81 provinces", () => {
    expect(TR_PROVINCES).toHaveLength(81);
    expect(new Set(TR_PROVINCES).size).toBe(81);
  });

  it("matches regardless of case, Turkish letters and trailing punctuation", () => {
    expect(findTurkishProvince("MALATYA")).toBe("Malatya");
    expect(findTurkishProvince("istanbul,")).toBe("İstanbul");
    expect(findTurkishProvince("IĞDIR")).toBe("Iğdır");
    expect(findTurkishProvince("Battalgazi")).toBeNull();
  });
});
