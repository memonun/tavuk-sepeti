import { describe, expect, it } from "vitest";

import {
  FAQ_PUBLISHED_MAX,
  FAQ_PUBLISHED_MIN,
  faqPageSchema,
  publishedFaqItems,
} from "./info-page.schema";
import { buildFaqPage, CONTACT_PAGE, FAQ_PAGE_TEXT } from "./info-pages";
import { COMPANY, CONTRACTED_CARGO_CARRIER } from "./legal";
import { APPROVED_PRODUCT_COPY } from "./product-copy";
import { PAYMENT_METHOD_OPTIONS } from "./storefront.config";
import { DEFAULT_STOREFRONT_SETTINGS, type StorefrontSettings } from "./storefront-settings";
import { buildWhatsAppLink, SUPPORT_WHATSAPP_E164 } from "./support-contact";
import { formatTRY } from "@/shared/utils/money";

const answerOf = (page: ReturnType<typeof buildFaqPage>, id: string) => {
  const item = publishedFaqItems(page).find((entry) => entry.id === id);
  if (!item) throw new Error(`missing question ${id}`);
  return item.answer.join(" ");
};

describe("buildFaqPage", () => {
  const page = buildFaqPage(DEFAULT_STOREFRONT_SETTINGS);
  const published = publishedFaqItems(page);

  it("publishes a short, real list with unique ids", () => {
    expect(published.length).toBeGreaterThanOrEqual(FAQ_PUBLISHED_MIN);
    expect(published.length).toBeLessThanOrEqual(FAQ_PUBLISHED_MAX);
    const ids = page.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never renders an owner TODO, and every TODO is marked for Hamit Bey", () => {
    const todos = page.items.filter((item) => item.status === "owner-todo");
    expect(todos.length).toBeGreaterThan(0);
    for (const todo of todos) {
      expect(todo.todo.startsWith("TODO(Hamit Bey):"), todo.id).toBe(true);
      expect(published.map((item) => item.id)).not.toContain(todo.id);
    }
    for (const item of published) {
      expect(item.answer.join(" "), item.id).not.toMatch(/TODO|sonra eklenicek/);
    }
  });

  it("reads delivery days, fee and minimums from the store settings", () => {
    const settings: StorefrontSettings = {
      homeDeliveryDays: [1, 5],
      homeDeliveryFeeMinor: 7_500,
      homeMinOrderMinor: 30_000,
      cargoMinOrderMinor: 120_000,
    };
    const live = buildFaqPage(settings);
    expect(answerOf(live, "eve-teslimat-gunleri")).toContain("Pazartesi ve Cuma");
    const fees = answerOf(live, "teslimat-ucreti-minimum-tutar");
    expect(fees).toContain(formatTRY(7_500));
    expect(fees).toContain(formatTRY(30_000));
    expect(fees).toContain(formatTRY(120_000));
    // The launch defaults must not leak in when the owner changed them.
    expect(fees).not.toContain(formatTRY(DEFAULT_STOREFRONT_SETTINGS.homeDeliveryFeeMinor));
  });

  it("states free delivery and no minimum when the owner sets them to zero", () => {
    const free = buildFaqPage({
      ...DEFAULT_STOREFRONT_SETTINGS,
      homeDeliveryFeeMinor: 0,
      homeMinOrderMinor: 0,
      cargoMinOrderMinor: 0,
    });
    const fees = answerOf(free, "teslimat-ucreti-minimum-tutar");
    expect(fees).toContain("elden teslimat ücretsiz");
    expect(fees).toContain("Eve teslimatta minimum sipariş tutarı yoktur.");
    expect(fees).toContain("Kargo siparişlerinde minimum sipariş tutarı yoktur.");
  });

  it("lists every payment option, with cash on delivery only for home delivery", () => {
    const answer = answerOf(page, "odeme-secenekleri");
    for (const option of PAYMENT_METHOD_OPTIONS) expect(answer).toContain(option.label);
    const [delivery, shipping] = answer.split("Kargo siparişlerinde:");
    expect(delivery).toContain("Kapıda nakit ödeme");
    expect(shipping?.split(".")[0]).not.toContain("Kapıda nakit ödeme");
  });

  it("quotes the facts from their sources", () => {
    expect(answerOf(page, "kargo-firmasi")).toContain(CONTRACTED_CARGO_CARRIER);
    const eggs = APPROVED_PRODUCT_COPY.find((copy) => copy.key === "eggs")?.description;
    expect(eggs).toBeDefined();
    expect(answerOf(page, "yumurta-tazeligi")).toContain(eggs!);
    expect(answerOf(page, "iade-cayma-hakki")).toContain("14 gün");
    expect(answerOf(page, "iade-cayma-hakki")).toContain(COMPANY.email);
  });

  it("links recurring orders and order lookup to their pages", () => {
    const hrefs = published.flatMap((item) => item.links.map((link) => link.href));
    expect(hrefs).toContain("/duzenli-siparis");
    expect(hrefs).toContain("/siparis-sorgula");
    expect(hrefs).toContain("/iptal-iade-kosullari");
  });

  it("keeps amounts out of the static metadata", () => {
    expect(FAQ_PAGE_TEXT.description).not.toMatch(/₺|\d/);
  });

  it("keeps the meta description short enough not to be cut in results", () => {
    expect([...FAQ_PAGE_TEXT.description].length).toBeLessThanOrEqual(155);
  });
});

describe("faqPageSchema", () => {
  const published = (id: string) => ({ status: "published", id, question: `${id}?`, answer: ["Cevap."] });

  it("rejects duplicate ids", () => {
    const items = [...Array.from({ length: 8 }, (_, i) => published(`soru-${i}`)), published("soru-0")];
    expect(faqPageSchema.safeParse({ ...FAQ_PAGE_TEXT, items }).success).toBe(false);
  });

  it("rejects too few or too many published questions", () => {
    const few = Array.from({ length: FAQ_PUBLISHED_MIN - 1 }, (_, i) => published(`soru-${i}`));
    const many = Array.from({ length: FAQ_PUBLISHED_MAX + 1 }, (_, i) => published(`soru-${i}`));
    expect(faqPageSchema.safeParse({ ...FAQ_PAGE_TEXT, items: few }).success).toBe(false);
    expect(faqPageSchema.safeParse({ ...FAQ_PAGE_TEXT, items: many }).success).toBe(false);
  });

  it("rejects external follow-up links", () => {
    const items = Array.from({ length: 8 }, (_, i) => published(`soru-${i}`));
    items[0] = { ...items[0]!, links: [{ href: "https://example.com", title: "Dış" }] } as (typeof items)[number];
    expect(faqPageSchema.safeParse({ ...FAQ_PAGE_TEXT, items }).success).toBe(false);
  });
});

describe("CONTACT_PAGE", () => {
  it("shows the business identity exactly as COMPANY has it", () => {
    expect(CONTACT_PAGE.brand).toBe(COMPANY.brand);
    expect(CONTACT_PAGE.ownerName).toBe(COMPANY.ownerName);
    expect(CONTACT_PAGE.address).toBe(COMPANY.address);
    const channel = (id: string) => CONTACT_PAGE.channels.find((item) => item.id === id);
    expect(channel("phone")).toMatchObject({ value: COMPANY.phone, href: "tel:+905332556444" });
    expect(channel("email")).toMatchObject({ value: COMPANY.email, href: `mailto:${COMPANY.email}` });
    expect(channel("whatsapp")?.href).toBe(buildWhatsAppLink(SUPPORT_WHATSAPP_E164));
  });

  it("keeps the owner's open questions out of the rendered fields", () => {
    expect(CONTACT_PAGE.ownerTodos.every((todo) => todo.startsWith("TODO(Hamit Bey):"))).toBe(true);
    const rendered = JSON.stringify({ ...CONTACT_PAGE, ownerTodos: [] });
    expect(rendered).not.toContain("TODO");
  });
});
