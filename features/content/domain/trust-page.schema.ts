import { z } from "zod";

import { recipeDateSchema } from "./recipe.schema";

const textSchema = z.string().trim().min(1);
const sourceIdSchema = textSchema.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sourceIdsSchema = z.array(sourceIdSchema).min(1);

/**
 * Where a sentence or photo comes from:
 * - `instagram`: a dated post on the verified @mr.apuhan account.
 * - `owner`: text Hamit Apuhan wrote, or a photo he sent, for these pages.
 *   The reference names the dated record in docs/hakkimizda-kaynaklar.md.
 * - `company`: the business identity in the repo (COMPANY).
 */
export const trustSourceSchema = z.object({
  id: sourceIdSchema,
  kind: z.enum(["instagram", "owner", "company"]),
  claim: textSchema,
  reference: textSchema,
  date: recipeDateSchema.nullable(),
}).superRefine((source, ctx) => {
  if (source.kind === "instagram" && !/^https:\/\/www\.instagram\.com\/(?:mr\.apuhan\/(?:reel|p)\/[^/]+\/|stories\/highlights\/\d+\/)$/.test(source.reference)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reference"], message: "Doğrulanan hesabın paylaşım bağlantısı gerekli." });
  }
  if (source.kind === "owner" && !/^sahip-(?:metni|fotograflari)-\d{4}-\d{2}-\d{2}$/.test(source.reference)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reference"], message: "İşletme sahibinin tarihli metin veya fotoğraf kaydı gerekli." });
  }
  if (source.kind !== "company" && source.date === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["date"], message: "Kaynak tarihi gerekli." });
  }
});

export const trustTextSchema = z.object({
  text: textSchema,
  sourceIds: sourceIdsSchema,
});

export const trustImageSchema = z.object({
  src: z.string().regex(/^\/hakkimizda\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/),
  alt: textSchema,
  width: z.number().int().positive().max(1600),
  height: z.number().int().positive().max(1600),
  sourceIds: sourceIdsSchema,
});

export const trustPageSchema = z.object({
  slug: z.enum(["hakkimizda", "ciftligimiz"]),
  /** The page's name: breadcrumb, <title>, menus. */
  title: textSchema,
  /** The visible <h1>; may be the owner's own headline rather than the name. */
  heading: textSchema,
  description: trustTextSchema,
  lead: z.array(trustTextSchema).min(1),
  hero: trustImageSchema,
  sections: z.array(z.object({
    id: sourceIdSchema,
    heading: textSchema,
    paragraphs: z.array(trustTextSchema).min(1),
    image: trustImageSchema.optional(),
  })).min(1),
  closing: z.object({
    paragraphs: z.array(trustTextSchema).min(1),
    /** A letter's sign-off line, set above the owner's name. */
    signOff: textSchema.optional(),
    image: trustImageSchema.optional(),
  }),
  relatedLink: z.object({
    href: z.enum(["/hakkimizda", "/ciftligimiz"]),
    label: textSchema,
  }),
}).superRefine((page, ctx) => {
  const seen = new Set<string>();
  page.sections.forEach((section, index) => {
    if (seen.has(section.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "id"], message: "Bölüm kimlikleri benzersiz olmalı." });
    }
    seen.add(section.id);
  });
});

export type TrustPage = z.infer<typeof trustPageSchema>;
export type TrustImage = z.infer<typeof trustImageSchema>;

/** Every photo on a page, in reading order. */
export function trustPageImages(page: TrustPage): TrustImage[] {
  return [
    page.hero,
    ...page.sections.flatMap((section) => section.image ? [section.image] : []),
    ...(page.closing.image ? [page.closing.image] : []),
  ];
}

/** Every sourced sentence on a page, the meta description included. */
export function trustPageTexts(page: TrustPage) {
  return [
    page.description,
    ...page.lead,
    ...page.sections.flatMap((section) => section.paragraphs),
    ...page.closing.paragraphs,
  ];
}

export const trustContentSchema = z.object({
  sources: z.array(trustSourceSchema).min(1),
  pages: z.array(trustPageSchema).min(1),
}).superRefine((content, ctx) => {
  const sourceIds = new Set<string>();
  content.sources.forEach((source, index) => {
    if (sourceIds.has(source.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sources", index, "id"], message: "Kaynak kimlikleri benzersiz olmalı." });
    }
    sourceIds.add(source.id);
  });
  const slugs = new Set<string>();
  content.pages.forEach((page, index) => {
    if (slugs.has(page.slug)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index, "slug"], message: "Sayfa adresleri benzersiz olmalı." });
    }
    slugs.add(page.slug);
    const images = trustPageImages(page);
    for (const item of [...trustPageTexts(page), ...images]) {
      for (const id of item.sourceIds) {
        if (!sourceIds.has(id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index], message: `Bilinmeyen kaynak: ${id}` });
        }
      }
    }
    for (const image of images) {
      for (const id of image.sourceIds) {
        const kind = content.sources.find((source) => source.id === id)?.kind;
        if (kind !== "instagram" && kind !== "owner") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index], message: "Görsellerin bir paylaşım ya da işletme sahibi kaynağı gerekli." });
        }
      }
    }
  });
});
