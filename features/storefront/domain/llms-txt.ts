/**
 * /llms.txt (https://llmstxt.org): a plain-Markdown map of the shop for AI
 * assistants — who we are, what we sell and where it can be delivered, and
 * which pages answer the rest. Rendered by app/llms.txt/route.ts.
 *
 * Every sentence is built from facts the site already states (COMPANY, the
 * storefront description, each page's own meta description), so this file can
 * never claim something the visible pages do not. No prices: they change and
 * an assistant would quote a stale one; the product page is linked instead.
 *
 * Pure: no env, no I/O, no Next types.
 */
import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";
import { COMPANY, CONTRACTED_CARGO_CARRIER } from "@/features/storefront/domain/legal";
import { STOREFRONT_DESCRIPTION } from "@/features/storefront/domain/structured-data";
import { buildWhatsAppLink, SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

export interface LlmsTxtProduct {
  readonly display_name: string;
  readonly web_slug: string | null;
  /** productPageDescription(product): the same text as the page's meta description. */
  readonly description: string;
  readonly fulfillment_type: FulfillmentChannel;
}

export interface LlmsTxtPage {
  /** Site-relative path, e.g. "/sss". */
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

export interface LlmsTxtInput {
  readonly products: readonly LlmsTxtProduct[];
  /** About, farm, FAQ, contact, standing orders, order lookup. */
  readonly pages: readonly LlmsTxtPage[];
  readonly recipes: readonly LlmsTxtPage[];
  /** Legal texts: useful context, but skippable ("Optional" in the spec). */
  readonly legal: readonly LlmsTxtPage[];
}

const DELIVERY_NOTE: Record<FulfillmentChannel, string> = {
  delivery: "Yalnızca Malatya içine eve teslim edilir.",
  shipping: "Malatya içine eve teslim edilir, Türkiye geneline kargoyla gönderilir.",
};

/** One line: "- [title](url): note". Newlines in a note would break the list. */
function link(title: string, path: string, note: string): string {
  const url = path === "/" ? CANONICAL_ORIGIN : `${CANONICAL_ORIGIN}${path}`;
  const text = note.replace(/\s+/g, " ").trim();
  return text ? `- [${title}](${url}): ${text}` : `- [${title}](${url})`;
}

function section(heading: string, lines: readonly string[]): string[] {
  return lines.length > 0 ? [`## ${heading}`, "", ...lines, ""] : [];
}

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const seen = new Set<string>();
  const products = input.products.flatMap((product) => {
    if (!product.web_slug || seen.has(product.web_slug)) return [];
    seen.add(product.web_slug);
    return [
      link(
        product.display_name,
        `/urun/${product.web_slug}`,
        `${product.description} ${DELIVERY_NOTE[product.fulfillment_type]}`,
      ),
    ];
  });

  return [
    `# ${COMPANY.brand}`,
    "",
    `> ${STOREFRONT_DESCRIPTION}`,
    "",
    `${COMPANY.brand}, ${COMPANY.ownerName}'ın ${COMPANY.address} adresindeki çiftliğidir. Siparişler ${CANONICAL_ORIGIN} üzerinden verilir. Taze ürünler (yumurta gibi) yalnızca Malatya içine eve teslim edilir; kargoya uygun ürünler Türkiye geneline ${CONTRACTED_CARGO_CARRIER} ile gönderilir. Güncel fiyatlar ürün sayfalarındadır.`,
    "",
    `İletişim: telefon ${COMPANY.phone}, WhatsApp ${buildWhatsAppLink(SUPPORT_WHATSAPP_E164)}, e-posta ${COMPANY.email}.`,
    "",
    ...section("Ürünler", products),
    ...section(
      "Çiftlik ve alışveriş",
      input.pages.map((page) => link(page.title, page.path, page.description)),
    ),
    ...section(
      "Tarifler",
      input.recipes.map((recipe) => link(recipe.title, recipe.path, recipe.description)),
    ),
    ...section(
      "Optional",
      input.legal.map((doc) => link(doc.title, doc.path, doc.description)),
    ),
  ].join("\n");
}
