import { z } from "zod";

const sourceSchema = z.object({
  label: z.string().trim().min(1),
  href: z.string().url().startsWith("https://"),
  kind: z.enum(["farm", "nutrition", "catalog"]),
});

const copySchema = z.object({
  key: z.string().min(1),
  description: z.string().trim().min(1).max(500),
  sources: z.array(sourceSchema).min(1),
});

// Approved on 2026-10-16. The DB remains the editable source of product text.
// These exact texts bind references to the claims they support: an admin edit
// must not inherit citations for a different description.
export const APPROVED_PRODUCT_COPY = z.array(copySchema).parse([
  {
    "key": "eggs",
    "description": "Akçadağ’daki gezen tavuklarımızın yumurtalarını her gün topluyoruz. Protein içeren yumurtalarımızı 15’li paketlerle Malatya içinde teslim ediyoruz.",
    "sources": [
      {
        "label": "Çiftlik bilgisi",
        "href": "https://apuhanciftligi.com/ciftligimiz",
        "kind": "farm"
      },
      {
        "label": "Beslenme kaynağı · TürKomp",
        "href": "https://turkomp.tarimorman.gov.tr/food-yumurta-tavuk-tam-26",
        "kind": "nutrition"
      }
    ]
  },
  {
    "key": "gun-kurusu-kayisi",
    "description": "Malatya’daki bahçemizden, çekirdeklerini elle ayırdığımız gün kurusu kayısı. Lif içeren, kayısının kendine özgü tatlılığını günlük beslenmenize taşıyan bir kuru meyve.",
    "sources": [
      {
        "label": "Çiftlik bilgisi",
        "href": "https://apuhanciftligi.com/ciftligimiz",
        "kind": "farm"
      },
      {
        "label": "Beslenme kaynağı · TürKomp",
        "href": "https://turkomp.tarimorman.gov.tr/food-kayisi-hacihaliloglu-gunkurusu-347",
        "kind": "nutrition"
      }
    ]
  },
  {
    "key": "sari-kuru-kayisi",
    "description": "Bahçemizin kayısılarından hazırladığımız sarı kuru kayısı. Lif ve potasyum içeren kuru kayısıyı, gün içinde küçük bir ara öğün olarak değerlendirebilirsiniz.",
    "sources": [
      {
        "label": "Çiftlik bilgisi",
        "href": "https://apuhanciftligi.com/ciftligimiz",
        "kind": "farm"
      },
      {
        "label": "Beslenme kaynağı · TürKomp",
        "href": "https://turkomp.tarimorman.gov.tr/food-kayisi-hacihaliloglu-kukurtlu-kuru-348",
        "kind": "nutrition"
      }
    ]
  },
  {
    "key": "dut-pekmezi",
    "description": "Bahçemizin dutlarından, babaannemin hazırladığı pekmez. Dutun kendine özgü tadını kahvaltınıza taşıyan bu aile ürününü 930 gramlık kavanozlarda sunuyoruz.",
    "sources": [
      {
        "label": "Üretim kaynağı",
        "href": "https://apuhanciftligi.com/ciftligimiz",
        "kind": "farm"
      },
      {
        "label": "Ürün bilgisi",
        "href": "https://apuhanciftligi.com/urun/dut-pekmezi",
        "kind": "catalog"
      }
    ]
  },
  {
    "key": "dut-kurusu",
    "description": "Malatya’daki bahçemizin dutlarını kurutarak hazırlıyoruz. Lif içeren dut kurusu, günlük beslenmenizde sade olarak yer verebileceğiniz bir kuru meyve.",
    "sources": [
      {
        "label": "Çiftlik bilgisi",
        "href": "https://apuhanciftligi.com/ciftligimiz",
        "kind": "farm"
      },
      {
        "label": "Beslenme kaynağı · TürKomp",
        "href": "https://turkomp.tarimorman.gov.tr/food-dut-beyaz-kuru-373",
        "kind": "nutrition"
      }
    ]
  },
  {
    "key": "gun-kurusu-kayisi-cekirdegi",
    "description": "Kayısı ürünlerimiz arasında sunduğumuz gün kurusu kayısı çekirdeği. Yarım kilodan başlayan miktarlarda, kuru kayısıdan ayrı olarak sipariş verebilirsiniz.",
    "sources": [
      {
        "label": "Ürün kaynağı",
        "href": "https://apuhanciftligi.com/urun/gun-kurusu-kayisi-cekirdegi",
        "kind": "catalog"
      }
    ]
  }
]);

export function getProductDescriptionReferences(
  productKey: string,
  description: string | null | undefined,
) {
  return APPROVED_PRODUCT_COPY.find(
    (copy) => copy.key === productKey && copy.description === description?.trim(),
  ) ?? null;
}
