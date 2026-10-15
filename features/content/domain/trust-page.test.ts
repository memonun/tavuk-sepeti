import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { trustContentSchema, trustImageSchema, trustPageSchema, trustSourceSchema } from "./trust-page.schema";
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
      for (const section of item.sections) {
        expect(section.paragraphs.length).toBeGreaterThan(0);
        for (const paragraph of section.paragraphs) {
          expect(paragraph.text.trim()).not.toBe("");
          expect(paragraph.sourceIds.length).toBeGreaterThan(0);
        }
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

  it("ships local WebP files with alt text and a dated Instagram source in the image table", () => {
    for (const item of TRUST_CONTENT.pages) {
      const images = [item.hero, ...item.sections.flatMap((section) => section.image ? [section.image] : [])];
      for (const image of images) {
        expect(existsSync(join(process.cwd(), "public", image.src)), image.src).toBe(true);
        const file = readFileSync(join(process.cwd(), "public", image.src));
        expect(file.subarray(0, 4).toString()).toBe("RIFF");
        expect(file.subarray(8, 12).toString()).toBe("WEBP");
        expect(image.alt.trim()).not.toBe("");
        const filename = image.src.split("/").at(-1)!;
        const row = docRows.find((line) => line.startsWith(`| \`${filename}\` |`));
        expect(row, image.src).toBeDefined();
        for (const id of image.sourceIds) {
          const source = TRUST_CONTENT.sources.find((candidate) => candidate.id === id)!;
          expect(source.kind, image.src).toBe("instagram");
          expect(row, image.src).toContain(source.reference);
          expect(row, image.src).toContain(source.date);
        }
      }
    }
  });

  it("has enough distinct farm information and photos for a separate farm page", () => {
    const farm = TRUST_CONTENT.pages.find((item) => item.slug === "ciftligimiz")!;
    const factIds = new Set(farm.sections.flatMap((section) => section.paragraphs.flatMap((paragraph) => paragraph.sourceIds)));
    expect(factIds.size).toBeGreaterThanOrEqual(4);
    expect([...factIds].every((id) => TRUST_CONTENT.sources.some((source) => source.id === id && source.kind === "instagram"))).toBe(true);
    const photos = [farm.hero, ...farm.sections.flatMap((section) => section.image ? [section.image] : [])];
    expect(new Set(photos.map((image) => image.src)).size).toBeGreaterThanOrEqual(3);
  });

  it("keeps editorial biography notes distinct from published evidence", () => {
    for (const source of TRUST_CONTENT.sources.filter((item) => item.id.startsWith("bio-"))) {
      expect(source.kind).toBe("editorial");
      expect(source.reference).toBe("biyografi-notu-2026-10-15");
      expect(source.date).toBe("2026-10-15");
    }
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
    expect(trustContentSchema.safeParse({ ...TRUST_CONTENT, sources: TRUST_CONTENT.sources.filter((source) => source.id !== "bio-family") }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, sections: [] }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, introduction: { text: " ", sourceIds: ["bio-family"] } }).success).toBe(false);
    expect(trustPageSchema.safeParse({ ...page, introduction: { text: "Bir metin.", sourceIds: [] } }).success).toBe(false);
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

  it("rejects an editorial note being used as a photo source", () => {
    expect(trustContentSchema.safeParse({
      ...TRUST_CONTENT,
      pages: [{ ...page, hero: { ...page.hero, sourceIds: ["bio-family"] } }],
    }).success).toBe(false);
  });

  it("requires dated posts from the verified Instagram account", () => {
    const source = TRUST_CONTENT.sources.find((item) => item.kind === "instagram")!;
    expect(trustSourceSchema.safeParse({ ...source, reference: "https://www.instagram.com/another-account/reel/example/" }).success).toBe(false);
    expect(trustSourceSchema.safeParse({ ...source, date: null }).success).toBe(false);
    expect(trustSourceSchema.safeParse({ ...source, date: "2026-02-30" }).success).toBe(false);
  });
});
