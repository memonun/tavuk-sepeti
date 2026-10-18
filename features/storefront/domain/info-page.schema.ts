/**
 * Shapes for the two plain info pages, /sss and /iletisim.
 *
 * Every sentence on them has to be true today, so the content module builds
 * them from the facts the shop already runs on (COMPANY, payment options, the
 * owner-editable storefront settings) and parses the result here. A question
 * only the owner can answer is kept as an `owner-todo` item: it stays in the
 * repo as a visible reminder but is never rendered or put into JSON-LD.
 */
import { z } from "zod";

const textSchema = z.string().trim().min(1);
const idSchema = textSchema.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Visible follow-up links under an answer; internal pages only. */
export const infoLinkSchema = z.object({
  href: z.string().regex(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/),
  title: textSchema,
});

export const faqItemSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("published"),
    id: idSchema,
    question: textSchema,
    answer: z.array(textSchema).min(1),
    links: z.array(infoLinkSchema).default([]),
  }),
  z.object({
    status: z.literal("owner-todo"),
    id: idSchema,
    question: textSchema,
    /** What Hamit Bey has to tell us before this can go live. */
    todo: textSchema,
  }),
]);

/** Google's guidance and the roadmap both ask for a short, real list. */
export const FAQ_PUBLISHED_MIN = 8;
export const FAQ_PUBLISHED_MAX = 12;

export const faqPageSchema = z.object({
  slug: z.literal("sss"),
  title: textSchema,
  heading: textSchema,
  description: textSchema,
  intro: textSchema,
  items: z.array(faqItemSchema).min(1),
}).superRefine((page, ctx) => {
  const seen = new Set<string>();
  page.items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "id"], message: "Soru kimlikleri benzersiz olmalı." });
    }
    seen.add(item.id);
  });
  const published = page.items.filter((item) => item.status === "published").length;
  if (published < FAQ_PUBLISHED_MIN || published > FAQ_PUBLISHED_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["items"],
      message: `Yayındaki soru sayısı ${FAQ_PUBLISHED_MIN}–${FAQ_PUBLISHED_MAX} arasında olmalı.`,
    });
  }
});

export type FaqPage = z.infer<typeof faqPageSchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;
export type PublishedFaqItem = Extract<FaqItem, { status: "published" }>;

/** The questions that are rendered (and mirrored in FAQPage JSON-LD). */
export function publishedFaqItems(page: Pick<FaqPage, "items">): PublishedFaqItem[] {
  return page.items.filter((item): item is PublishedFaqItem => item.status === "published");
}

export const contactChannelSchema = z.object({
  id: z.enum(["phone", "whatsapp", "email"]),
  label: textSchema,
  /** Shown exactly as written in COMPANY / support-contact. */
  value: textSchema,
  href: z.string().regex(/^(?:tel:\+\d{10,15}|mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/wa\.me\/\d{10,15})$/),
});

export const contactPageSchema = z.object({
  slug: z.literal("iletisim"),
  title: textSchema,
  heading: textSchema,
  description: textSchema,
  intro: textSchema,
  brand: textSchema,
  ownerName: textSchema,
  address: textSchema,
  channels: z.array(contactChannelSchema).min(1),
  /** Practical tips under the channels (e.g. "add your order number"). */
  notes: z.array(textSchema).min(1),
  links: z.array(infoLinkSchema),
  /** Facts the owner still has to give; not rendered. */
  ownerTodos: z.array(textSchema),
}).superRefine((page, ctx) => {
  const ids = page.channels.map((channel) => channel.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["channels"], message: "Her iletişim kanalı bir kez yer almalı." });
  }
});

export type ContactPage = z.infer<typeof contactPageSchema>;
export type ContactChannel = z.infer<typeof contactChannelSchema>;
