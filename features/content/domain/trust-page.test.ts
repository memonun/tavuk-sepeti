import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  trustContentSchema,
  trustImageSchema,
  trustPageImages,
  trustPageSchema,
  trustPageTexts,
  trustSourceSchema,
} from "./trust-page.schema";
import { TRUST_CONTENT } from "./trust-pages";

const page = TRUST_CONTENT.pages[0]!;
const sourcesDoc = readFileSync(join(process.cwd(), "docs/hakkimizda-kaynaklar.md"), "utf8");
const docRows = sourcesDoc.split("\n");

describe("trust content", () => {
  it("validates both published pages with unique slugs and non-empty sourced sections", () => {
    expect(trustContentSchema.safeParse(TRUST_CONTENT).success).toBe(true);
    expect(TRUST_CONTENT.pages.map((item) => item.slug)).toEqual(["hakkimizda", "ciftligimiz"]);
    expect(new Set(TRUST_CONTENT.pages.map((item) => item.slug)).size).toBe(2);
    for (const item of TRUST_CONTENT.pages) {
      expect(item.sections.length).toBeGreaterThan(0);
      for (const text of trustPageTexts(item)) {
        expect(text.text.trim()).not.toBe("");
        expect(text.sourceIds.length).toBeGreaterThan(0);
      }
    }
  });

  it("documents each fact with the same claim, reference and date", () => {
    for (const source of TRUST_CONTENT.sources) {
      const row = docRows.find((line) => line.startsWith(`| \`${source.id}\` |`));
      expect(row, source.id).toBeDefined();
      expect(row, source.id).toContain(source.claim);
      expect(row, source.id).toContain(source.reference);
      expect(row, source.id).toContain(source.date ?? "—");
    }
  });

  it("cites every post and owner record it lists, so the doc holds no stale facts", () => {
    const cited = new Set(TRUST_CONTENT.pages.flatMap((item) => [...trustPageTexts(item), ...trustPageImages(item)].flatMap((entry) => entry.sourceIds)));
    for (const source of TRUST_CONTENT.sources.filter((item) => item.kind !== "company")) {
      expect(cited.has(source.id), source.id).toBe(true);
    }
  });

  it("ships local metadata-free WebP files with alt text and a dated source in the image table", () => {
    for (const item of TRUST_CONTENT.pages) {
      for (const image of trustPageImages(item)) {
        expect(existsSync(join(process.cwd(), "public", image.src)), image.src).toBe(true);
        const file = readFileSync(join(process.cwd(), "public", image.src));
        expect(file.subarray(0, 4).toString()).toBe("RIFF");
        expect(file.subarray(8, 12).toString()).toBe("WEBP");
        // EXIF carries the phone's GPS position; the farmhouse location must not ship.
        // Only the extended (VP8X) format can hold metadata, flagged in its header.
        const extended = file.subarray(12, 16).toString() === "VP8X";
        expect(extended && (file[20]! & (0x08 | 0x04)) !== 0, image.src).toBe(false);
        expect(image.alt.trim()).not.toBe("");
        const filename = image.src.split("/").at(-1)!;
        const row = docRows.find((line) => line.startsWith(`| \`${filename}\` |`));
        expect(row, image.src).toBeDefined();
        for (const id of image.sourceIds) {
          const source = TRUST_CONTENT.sources.find((candidate) => candidate.id === id)!;
          expect(["instagram", "owner"], image.src).toContain(source.kind);
          expect(row, image.src).toContain(source.reference);
          expect(row, image.src).toContain(source.date);
        }
      }
    }
  });

  it("gives the farm page its own facts and at least three distinct photos", () => {
    const farm = TRUST_CONTENT.pages.find((item) => item.slug === "ciftligimiz")!;
    const factIds = new Set(farm.sections.flatMap((section) => section.paragraphs.flatMap((paragraph) => paragraph.sourceIds)));
    expect(factIds.size).toBeGreaterThanOrEqual(4);
    expect([...factIds].every((id) => TRUST_CONTENT.sources.some((source) => source.id === id && source.kind !== "company"))).toBe(true);
    expect(new Set(trustPageImages(farm).map((image) => image.src)).size).toBeGreaterThanOrEqual(3);
  });

  it("points every owner record at the dated owner letter or photo set", () => {
    for (const source of TRUST_CONTENT.sources.filter((item) => item.kind === "owner")) {
      expect(["sahip-metni-2026-10-15", "sahip-fotograflari-2026-10-15"]).toContain(source.reference);
      expect(source.date).toBe("2026-10-15");
    }
  });

  it("closes the letter with the owner's sign-off", () => {
    expect(page.closing.signOff).toBe("Sevgi ve saygılarımla,");
  });

  it("does not publish prohibited claims or placeholders", () => {
    const copy = JSON.stringify(TRUST_CONTENT.pages).toLocaleLowerCase("tr-TR");
    for (const word of ["organik", "ekolojik", "biyolojik", "hormonsuz", "todo", "placeholder", "sonra eklenicek"]) {
      expect(copy).not.toContain(word);
    }
  });

  it("rejects duplicate page, source and section identifiers", () => {
    expect(trustContentSchema.safeParse({ ...TRUST_CONTENT, pages: [page, page] }).success).toBe(false);
    expect(trustContentSchema.safeParse({ ...TRUST_CONTENT, sources: [...TRUST_CONTENT.sources, TRUST_CONTENT.sources[0]] }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, sections: [page.sections[0], page.sections[0]] }).success).toBe(false);
  });

  it("rejects missing source records and unattributed or empty content", () => {
    expect(trustContentSchema.safeParse({ ...TRUST_CONTENT, sources: [] }).success).toBe(false);
    expect(trustContentSchema.safeParse({ ...TRUST_CONTENT, sources: TRUST_CONTENT.sources.filter((source) => source.id !== "owner-founding") }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, sections: [] }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, lead: [] }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, lead: [{ text: " ", sourceIds: ["owner-founding"] }] }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, lead: [{ text: "Bir metin.", sourceIds: [] }] }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, closing: { paragraphs: [] } }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, sections: [{ id: "aile", heading: "Aile", paragraphs: [] }] }).success).toBe(false);
  });

  it.each(["https://cdn.example.com/photo.webp", "/hakkimizda/../photo.webp", "/brand/logo.webp", "/hakkimizda/photo.jpg", "/hakkimizda/photo.webp?x=1"])("rejects unsafe or non-WebP image path %s", (src) => {
    expect(trustImageSchema.safeParse({ ...page.hero, src }).success).toBe(false);
  });

  it("requires meaningful alt text and bounded image dimensions", () => {
    expect(trustImageSchema.safeParse({ ...page.hero, alt: " " }).success).toBe(false);
    expect(trustImageSchema.safeParse({ ...page.hero, width: 1601 }).success).toBe(false);
    expect(trustImageSchema.safeParse({ ...page.hero, height: 0 }).success).toBe(false);
  });

  it("rejects the company record being used as a photo source", () => {
    expect(trustContentSchema.safeParse({
      ...TRUST_CONTENT,
      pages: [{ ...page, hero: { ...page.hero, sourceIds: ["company-identity"] } }],
    }).success).toBe(false);
  });

  it("requires dated posts from the verified Instagram account", () => {
    const source = TRUST_CONTENT.sources.find((item) => item.kind === "instagram")!;
    expect(trustSourceSchema.safeParse({ ...source, reference: "https://www.instagram.com/another-account/reel/example/" }).success).toBe(false);
    expect(trustSourceSchema.safeParse({ ...source, date: null }).success).toBe(false);
    expect(trustSourceSchema.safeParse({ ...source, date: "2026-02-30" }).success).toBe(false);
  });

  it("requires owner material to name a dated owner record", () => {
    const source = TRUST_CONTENT.sources.find((item) => item.kind === "owner")!;
    expect(trustSourceSchema.safeParse({ ...source, reference: "bir-yerden-duydum" }).success).toBe(false);
    expect(trustSourceSchema.safeParse({ ...source, date: null }).success).toBe(false);
  });
});
