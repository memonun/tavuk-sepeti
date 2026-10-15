import { z } from "zod";

import { recipeDateSchema } from "./recipe.schema";

const textSchema = z.string().trim().min(1);
const sourceIdSchema = textSchema.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sourceIdsSchema = z.array(sourceIdSchema).min(1);

export const trustSourceSchema = z.object({
  id: sourceIdSchema,
  kind: z.enum(["instagram", "editorial", "company"]),
  claim: textSchema,
  reference: textSchema,
  date: recipeDateSchema.nullable(),
}).superRefine((source, ctx) => {
  if (source.kind === "instagram" && !/^https:\/\/www\.instagram\.com\/(?:mr\.apuhan\/(?:reel|p)\/[^/]+\/|stories\/highlights\/\d+\/)$/.test(source.reference)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reference"], message: "Doğrulanan hesabın paylaşım bağlantısı gerekli." });
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
  caption: textSchema,
  width: z.number().int().positive().max(1600),
  height: z.number().int().positive().max(1600),
  sourceIds: sourceIdsSchema,
});

export const trustPageSchema = z.object({
  slug: z.enum(["hakkimizda", "ciftligimiz"]),
  title: textSchema,
  eyebrow: textSchema,
  description: trustTextSchema,
  introduction: trustTextSchema,
  hero: trustImageSchema,
  sections: z.array(z.object({
    id: sourceIdSchema,
    heading: textSchema,
    paragraphs: z.array(trustTextSchema).min(1),
    image: trustImageSchema.optional(),
  })).min(1),
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
    const items = [page.description, page.introduction, page.hero, ...page.sections.flatMap((section) => [
      ...section.paragraphs,
      ...(section.image ? [section.image] : []),
    ])];
    for (const item of items) {
      for (const id of item.sourceIds) {
        if (!sourceIds.has(id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index], message: `Bilinmeyen kaynak: ${id}` });
        }
      }
    }
    const images = [page.hero, ...page.sections.flatMap((section) => section.image ? [section.image] : [])];
    for (const image of images) {
      for (const id of image.sourceIds) {
        if (content.sources.find((source) => source.id === id)?.kind !== "instagram") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index], message: "Görsellerin Instagram paylaşım kaynağı gerekli." });
        }
      }
    }
  });
});

export type TrustPage = z.infer<typeof trustPageSchema>;
export type TrustImage = z.infer<typeof trustImageSchema>;
