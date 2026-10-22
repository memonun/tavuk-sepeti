/**
 * Content for /sss and /iletisim.
 *
 * Nothing here is new information: every answer restates a rule the shop
 * already enforces, read from the module that enforces it (payment options,
 * delivery days, fees, order floors, the legal texts' cancellation and
 * withdrawal rules). Fees, minimums and delivery days are owner-editable in
 * /magaza-ayarlari, so the FAQ is built from the live StorefrontSettings and
 * can never quote a stale amount.
 *
 * Questions only Hamit Bey can answer are `owner-todo` items: kept here as the
 * to-do list, never rendered. To publish one, give it an `answer` and set
 * `status: "published"` (the page allows 8–12 published questions).
 *
 * Pure: no I/O, no env.
 */
import { formatHomeDeliveryDays } from "@/features/storefront/domain/delivery-window";
import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";
import {
  faqPageSchema,
  contactPageSchema,
  type ContactPage,
  type FaqPage,
} from "@/features/storefront/domain/info-page.schema";
import { COMPANY, CONTRACTED_CARGO_CARRIER } from "@/features/storefront/domain/legal";
import { paymentMethodsForChannel } from "@/features/storefront/domain/payment-options";
import { APPROVED_PRODUCT_COPY } from "@/features/storefront/domain/product-copy";
import {
  cargoFeeNotice,
  DELIVERY_ONLY_BADGE,
  DELIVERY_PROVINCE,
  FULFILLMENT_NOTICE,
  MAX_DELIVERY_HORIZON_DAYS,
  MIN_DELIVERY_LEAD_DAYS,
  SHIPPING_BADGE,
  deliveryFeeNotice,
} from "@/features/storefront/domain/storefront.config";
import type { StorefrontSettings } from "@/features/storefront/domain/storefront-settings";
import { buildWhatsAppLink, SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";
import { formatTRY } from "@/shared/utils/money";

/** `["a", "b", "c"]` → `"a, b ve c"`. */
function listTr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

function paymentLabels(channel: FulfillmentChannel): string {
  return listTr(paymentMethodsForChannel(channel).map((option) => option.label));
}

/** The approved, sourced product text (product-copy.ts), word for word. */
function approvedCopy(productKey: string): string {
  const copy = APPROVED_PRODUCT_COPY.find((item) => item.key === productKey);
  // Build-time constant: fail the build, not a request.
  if (!copy) throw new Error(`No approved product copy for ${productKey}`);
  return copy.description;
}

const earliestDeliveryText =
  MIN_DELIVERY_LEAD_DAYS === 1 ? "en erken ertesi gün" : `en erken ${MIN_DELIVERY_LEAD_DAYS} gün sonrası`;

/** Static parts, also used for <head> metadata (no live amounts in there). */
export const FAQ_PAGE_TEXT = {
  slug: "sss",
  title: "Sıkça Sorulan Sorular",
  heading: "Sıkça Sorulan Sorular",
  description:
    "Malatya içi teslimat günleri, Türkiye geneli kargo, ödeme seçenekleri, düzenli sipariş, sipariş sorgulama, iptal ve iade hakkında sık sorulan sorular.",
  intro:
    "Teslimat, ödeme ve siparişlerle ilgili en çok sorulanları burada topladık. Aradığınızı bulamazsanız bize telefonla, WhatsApp'tan veya e-postayla ulaşabilirsiniz.",
} as const;

export function buildFaqPage(settings: StorefrontSettings): FaqPage {
  const homeMinimum = settings.homeMinOrderMinor > 0
    ? `Eve teslimatta minimum sipariş tutarı ${formatTRY(settings.homeMinOrderMinor)}.`
    : "Eve teslimatta minimum sipariş tutarı yoktur.";
  const cargoFee = cargoFeeNotice(settings);
  const cargoMinimum = settings.cargoMinOrderMinor > 0
    ? `Kargo siparişlerinde minimum sipariş tutarı ${formatTRY(settings.cargoMinOrderMinor)}.`
    : "Kargo siparişlerinde minimum sipariş tutarı yoktur.";

  return faqPageSchema.parse({
    ...FAQ_PAGE_TEXT,
    items: [
      {
        status: "published",
        id: "teslimat-bolgeleri",
        question: "Hangi bölgelere teslimat yapıyorsunuz?",
        answer: [
          FULFILLMENT_NOTICE,
          `Bir ürünün nereye gönderilebildiği ürün kartında yazar: “${DELIVERY_ONLY_BADGE}” ya da “${SHIPPING_BADGE}”. Malatya içindeki teslimat alanının güncel kapsamı, ödeme ekranında adresinize göre belirlenir.`,
        ],
        links: [{ href: "/teslimat-kosullari", title: "Teslimat Koşulları" }],
      },
      {
        status: "published",
        id: "eve-teslimat-gunleri",
        question: `${DELIVERY_PROVINCE}'da eve teslimat hangi günler yapılıyor?`,
        answer: [
          `Eve servis günlerimiz: ${formatHomeDeliveryDays(settings.homeDeliveryDays)}. Ödeme ekranında bu günlerden birini, ${earliestDeliveryText} ve en geç ${MAX_DELIVERY_HORIZON_DAYS} gün sonrası için seçebilirsiniz.`,
          "Eve teslimatta belirli bir saat veremiyoruz; siparişiniz seçtiğiniz gün içinde teslim edilir.",
        ],
      },
      {
        status: "published",
        id: "teslimat-ucreti-minimum-tutar",
        question: "Teslimat ücreti ve minimum sipariş tutarı ne kadar?",
        answer: [
          `${deliveryFeeNotice(settings.homeDeliveryFeeMinor)} ${homeMinimum}`,
          `${cargoFee} ${cargoMinimum}`,
          "Geçerli ücret ve toplam tutar, siparişi göndermeden önce ödeme ekranında da gösterilir.",
        ],
      },
      {
        status: "published",
        id: "kargo-firmasi",
        question: "Kargo siparişlerini hangi firmayla gönderiyorsunuz?",
        answer: [
          `Kargo siparişlerini anlaşmalı kargo firmamız ${CONTRACTED_CARGO_CARRIER} ile gönderiyoruz. Kargo siparişlerinde teslimat günü seçilmez; siparişiniz hazırlandıktan sonra kargoya verilir.`,
        ],
      },
      {
        status: "published",
        id: "yumurta-tazeligi",
        question: "Yumurtalarınız ne kadar taze?",
        answer: [
          approvedCopy("eggs"),
          "Yumurtayı size en uygun koşullarda ulaştırabilmek için kargoyla göndermiyoruz.",
        ],
      },
      {
        status: "published",
        id: "odeme-secenekleri",
        question: "Hangi ödeme yöntemlerini kullanabilirim?",
        answer: [
          `${DELIVERY_PROVINCE} içi eve teslimatta: ${paymentLabels("delivery")}. Kargo siparişlerinde: ${paymentLabels("shipping")}.`,
          "Kapıda nakit ödeme yalnızca eve teslimatta geçerlidir; kargo görevlisi bizim adımıza ödeme almaz. Kartla ödeme, PayTR'nin 3D Secure güvenli ödeme sayfasında yapılır; kart bilgileriniz bizim sipariş formumuzda istenmez.",
        ],
      },
      {
        status: "published",
        id: "havale-eft",
        question: "Havale / EFT ile nasıl öderim?",
        answer: [
          "Ödeme ekranında Havale / EFT'yi seçtiğinizde hesap bilgilerimiz (IBAN) gösterilir. Siparişiniz oluşunca, dekontu sipariş numaranızla birlikte WhatsApp'tan bize iletmeniz yeterli; ödemenizi kontrol edip siparişinize işliyoruz.",
        ],
      },
      {
        status: "published",
        id: "siparis-sorgulama",
        question: "Siparişimin durumunu nasıl öğrenirim?",
        answer: [
          "Hesabınızla verdiğiniz siparişler Hesabım sayfasında listelenir. Hesap açmadan verdiğiniz siparişi Sipariş Sorgula sayfasında, sipariş numaranızla veya siparişte kullandığınız telefon numarasıyla bulabilirsiniz; ödemesi yarım kaldıysa oradan tamamlayabilirsiniz.",
          "Eve teslimat siparişlerinde, teslimat rotası planlandıktan sonra tahmini teslimat saati de bu sayfada görünür.",
        ],
        links: [{ href: "/siparis-sorgula", title: "Sipariş Sorgula" }],
      },
      {
        status: "published",
        id: "duzenli-siparis",
        question: "Her hafta aynı ürünleri düzenli olarak alabilir miyim?",
        answer: [
          "Evet. Düzenli Sipariş sayfasından, hesabınıza giriş yaparak ürünlerinizi ve haftalık ya da iki haftada bir teslimat sıklığını seçebilirsiniz. Talebiniz ekibimiz tarafından onaylandıktan sonra siparişleriniz seçtiğiniz periyotta kendiliğinden oluşturulur.",
          "Düzenli siparişlerde karttan otomatik tahsilat yapılmaz; ödeme kapıda nakit veya havale/EFT ile yapılır. Her sipariş, oluşturulduğu günkü güncel fiyatlarla hesaplanır. Talebinizi hesabınızdaki Düzenli Siparişlerim alanından istediğiniz zaman iptal edebilirsiniz.",
        ],
        links: [
          { href: "/duzenli-siparis", title: "Düzenli Sipariş" },
          { href: "/duzenli-siparis-kosullari", title: "Düzenli Sipariş Koşulları" },
        ],
      },
      {
        status: "published",
        id: "siparis-iptali",
        question: "Siparişimi iptal edebilir miyim?",
        answer: [
          "Sitede otomatik iptal ekranı yok. Henüz hazırlanmamış, teslimata çıkmamış veya kargoya verilmemiş bir siparişi iptal etmek için bize e-postayla, telefonla ya da WhatsApp'tan sipariş numaranızla ulaşın. Talebiniz siparişin o anki durumuna göre değerlendirilir.",
        ],
        links: [{ href: "/iptal-iade-kosullari", title: "İptal ve İade Koşulları" }],
      },
      {
        status: "published",
        id: "iade-cayma-hakki",
        question: "Ürünü iade edebilir miyim?",
        answer: [
          "Kanuni istisnalar saklı kalmak üzere, siparişinizi verdiğiniz andan başlayarak ürünü teslim aldığınız günden itibaren 14 gün dolana kadar, gerekçe göstermeden cayma hakkınızı kullanabilirsiniz. Çabuk bozulabilen ürünlerde ve teslimden sonra ambalajı açılıp hijyen açısından iadesi uygun olmayan ürünlerde, mevzuattaki şartlar oluşursa bu hak uygulanmayabilir. Bir ürünün yalnızca gıda olması, tek başına cayma hakkını ortadan kaldırmaz.",
          `Cayma bildiriminizi yazılı olarak ${COMPANY.email} adresine iletebilirsiniz. Hakkın geçerli olduğu durumlarda ödemeniz, bildiriminiz bize ulaştıktan sonra en geç 14 gün içinde, ödeme yaptığınız yönteme uygun şekilde iade edilir.`,
        ],
        links: [{ href: "/iptal-iade-kosullari", title: "İptal ve İade Koşulları" }],
      },
      {
        status: "published",
        id: "hasarli-eksik-urun",
        question: "Ürün hasarlı, eksik ya da yanlış gelirse ne yapmalıyım?",
        answer: [
          `Bize ${COMPANY.email} adresinden ya da ${COMPANY.phone} numarasından ulaşın. Kargo tesliminde görünür bir hasar olup olmadığını kontrol etmenizi öneririz; ancak kargo görevlisiyle tutanak tutulmamış olması, yasal haklarınızı tek başına ortadan kaldırmaz.`,
        ],
        links: [{ href: "/iletisim", title: "İletişim" }],
      },
      // ── Hamit Bey'den beklenenler (yayında değil) ──────────────────────────
      {
        status: "owner-todo",
        id: "yumurta-saklama",
        question: "Yumurtaları evde nasıl saklamalıyım?",
        todo: "TODO(Hamit Bey): Buzdolabında mı, oda sıcaklığında mı? Kaç gün içinde tüketilmesini öneriyorsunuz? Pakette son tüketim tarihi yazıyor mu?",
      },
      {
        status: "owner-todo",
        id: "kuru-meyve-pekmez-saklama",
        question: "Kuru kayısı, dut kurusu ve pekmezi nasıl saklamalıyım?",
        todo: "TODO(Hamit Bey): Her ürün için saklama koşulu (serin/kuru yer, kapalı kap, buzdolabı) ve yaklaşık raf ömrü.",
      },
      {
        status: "owner-todo",
        id: "kargo-suresi-paketleme",
        question: "Kargom kaç günde gelir, nasıl paketleniyor?",
        todo: "TODO(Hamit Bey): Siparişten sonra kaç iş gününde kargoya veriliyor, Aras Kargo ortalama kaç günde ulaştırıyor, kuru meyve ve pekmez nasıl paketleniyor?",
      },
      {
        status: "owner-todo",
        id: "iade-gonderim-masrafi",
        question: "İade gönderim masrafını kim karşılıyor?",
        todo: "TODO(Hamit Bey): İptal ve İade Koşulları'nda da \"sonra eklenicek\" yazıyor. Cevap belli olunca hem bu soru hem legal.ts'teki RETURN_DETAILS güncellenmeli.",
      },
      {
        status: "owner-todo",
        id: "tavuk-beslenmesi",
        question: "Tavuklarınız ne ile besleniyor?",
        todo: "TODO(Hamit Bey): Yem içeriği, gezinme alanı ve günlük düzen; sizin anlatımınızla. (docs/hakkimizda-kaynaklar.md bunu bilerek boş bıraktı.)",
      },
      {
        status: "owner-todo",
        id: "yumurta-kodu",
        question: "Yumurtaların üzerindeki kod ne anlama geliyor?",
        todo: "TODO(Hamit Bey): Yumurtalara kod basılıyor mu? Basılıyorsa kodun kendisi (ör. 0-TR-…) ve neyi gösterdiği.",
      },
    ],
  });
}

const phoneDigits = COMPANY.phone.replace(/[^\d+]/g, "");

export const CONTACT_PAGE: ContactPage = contactPageSchema.parse({
  slug: "iletisim",
  title: "İletişim",
  heading: "Bize ulaşın",
  description: `${COMPANY.brand}'ne telefon, WhatsApp veya e-postayla ulaşın. Adresimiz: ${COMPANY.address}.`,
  intro:
    "Sipariş, teslimat ya da ürünlerimizle ilgili her sorunuz için bize telefonla, WhatsApp'tan veya e-postayla ulaşabilirsiniz.",
  brand: COMPANY.brand,
  ownerName: COMPANY.ownerName,
  address: COMPANY.address,
  channels: [
    { id: "phone", label: "Telefon", value: COMPANY.phone, href: `tel:${phoneDigits}` },
    { id: "whatsapp", label: "WhatsApp", value: COMPANY.phone, href: buildWhatsAppLink(SUPPORT_WHATSAPP_E164) },
    { id: "email", label: "E-posta", value: COMPANY.email, href: `mailto:${COMPANY.email}` },
  ],
  notes: [
    "Telefonla da sipariş verebilirsiniz.",
    "Bir siparişle ilgili yazıyorsanız sipariş numaranızı da ekleyin; doğru siparişi hemen bulalım.",
    "Cayma (iade) bildiriminizi yazılı olarak e-postayla iletebilirsiniz.",
  ],
  links: [
    { href: "/sss", title: "Sıkça Sorulan Sorular" },
    { href: "/siparis-sorgula", title: "Sipariş Sorgula" },
    { href: "/iptal-iade-kosullari", title: "İptal ve İade Koşulları" },
  ],
  ownerTodos: [
    "TODO(Hamit Bey): Telefon ve WhatsApp'a hangi gün ve saatlerde dönüş yapıyorsunuz?",
    "TODO(Hamit Bey): Çiftliği ziyaret etmek isteyenler için koşul var mı (randevu, gün, saat)?",
  ],
});
