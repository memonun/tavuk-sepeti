/**
 * Legal / compliance content for the storefront (Turkish e-commerce law + what
 * PayTR requires before activating a merchant account).
 *
 * ⚠️ FILL IN `COMPANY` BELOW ⚠️ — every legal page and the footer read from it,
 * so your company identity is entered in exactly one place. The templates are a
 * practical starting point; have them reviewed by a lawyer before launch.
 *
 * Pure data (no JSX / no I/O) so it stays in the domain layer and is easy to
 * diff/translate. The UI (legal-article.tsx / shop-footer.tsx) renders it.
 */

export interface Company {
  /** Ticari ünvan — legal company name (or şahıs şirketi full name). */
  readonly tradeName: string;
  /** Short brand shown in the footer/UI. */
  readonly brand: string;
  readonly address: string;
  readonly phone: string;
  readonly email: string;
  readonly taxOffice: string; // Vergi Dairesi
  readonly taxNo: string; // Vergi / TC Kimlik No
  readonly mersisNo: string; // "" if şahıs şirketi
  readonly kepAddress: string; // KEP adresi ("" if none)
  /** Public site URL (root domain). */
  readonly siteUrl: string;
  /** ETBİS doğrulama/kayıt bağlantısı (footer badge links here). */
  readonly etbisUrl: string;
}

// Şahıs işletmesi (Hamit Apuhan) — vergi levhasından dolduruldu.
// TODO(owner): phone + email zorunlu (yasal); taxNo herkese açık gösterim kararı bekliyor.
export const COMPANY: Company = {
  tradeName: "Hamit Apuhan",
  brand: "Apuhan Çiftliği",
  address: "Bahri Mah. Mezarlık Cad. No: 17, Akçadağ / Malatya",
  phone: "[+90 5xx xxx xx xx]",
  email: "[iletisim@apuhançiftliği.com]",
  taxOffice: "Akçadağ",
  taxNo: "[VERGİ / TC KİMLİK NO — bkz. not]",
  mersisNo: "",
  kepAddress: "",
  siteUrl: "https://xn--apuhaniftlii-pdb30f.com",
  etbisUrl: "https://etbis.ticaret.gov.tr/",
};

export interface LegalSection {
  readonly heading?: string;
  readonly paragraphs: readonly string[];
}

export interface LegalDoc {
  readonly slug: string;
  /** Footer + nav label. */
  readonly title: string;
  /** Longer <title>/heading. */
  readonly longTitle: string;
  readonly updated: string; // YYYY-MM-DD, shown as "son güncelleme"
  readonly sections: readonly LegalSection[];
}

const p = (...paragraphs: string[]): LegalSection => ({ paragraphs });
const s = (heading: string, ...paragraphs: string[]): LegalSection => ({
  heading,
  paragraphs,
});

const UPDATED = "2026-07-28";

export const LEGAL_DOCS: readonly LegalDoc[] = [
  {
    slug: "mesafeli-satis-sozlesmesi",
    title: "Mesafeli Satış Sözleşmesi",
    longTitle: "Mesafeli Satış Sözleşmesi",
    updated: UPDATED,
    sections: [
      s(
        "1. Taraflar",
        `SATICI: ${COMPANY.tradeName}, Adres: ${COMPANY.address}, Telefon: ${COMPANY.phone}, E-posta: ${COMPANY.email}, Vergi Dairesi/No: ${COMPANY.taxOffice} / ${COMPANY.taxNo}.`,
        "ALICI: Siparişi veren, bilgileri sipariş formunda yer alan müşteri.",
      ),
      s(
        "2. Konu",
        "İşbu sözleşmenin konusu, ALICI'nın SATICI'ya ait internet sitesi üzerinden elektronik ortamda sipariş verdiği, sözleşmede nitelikleri ve satış fiyatı belirtilen ürünün satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.",
      ),
      s(
        "3. Sözleşme Konusu Ürün ve Ödeme",
        "Ürünlerin cinsi, adedi, KDV dahil satış fiyatı ve teslimat bilgileri sipariş özetinde belirtildiği gibidir. Ödeme, kapıda nakit ödeme, banka havalesi/EFT veya kredi/banka kartı (PayTR altyapısı) ile yapılabilir. Kart ile ödemelerde işlem, 3D Secure ile güvenli ödeme sağlayıcısı üzerinden gerçekleştirilir; kart bilgileri SATICI tarafından saklanmaz.",
      ),
      s(
        "4. Teslimat",
        "Ürün, ALICI'nın sipariş sırasında bildirdiği adrese, kendi teslimat aracımızla (bölge içi) veya kargo ile (kargo ile gönderilen ürünler) teslim edilir. Teslimat süresi, cayma hakkı süresi saklı kalmak kaydıyla siparişin onayından itibaren en geç 30 gündür.",
      ),
      s(
        "5. Cayma Hakkı",
        "ALICI, sözleşmeden 14 (on dört) gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin cayma hakkına sahiptir. Ancak çabuk bozulan veya son kullanma tarihi geçebilecek gıda ürünleri (taze süt ürünleri, yumurta vb.) ile ambalajı açılmış hijyenik ürünlerde Yönetmelik gereği cayma hakkı kullanılamaz.",
      ),
      s(
        "6. Uyuşmazlıklar",
        "İşbu sözleşmeden doğabilecek uyuşmazlıklarda, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dahilinde ALICI'nın yerleşim yerindeki Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri yetkilidir.",
      ),
    ],
  },
  {
    slug: "on-bilgilendirme-formu",
    title: "Ön Bilgilendirme Formu",
    longTitle: "Ön Bilgilendirme Formu",
    updated: UPDATED,
    sections: [
      s(
        "Satıcı Bilgileri",
        `Ünvan: ${COMPANY.tradeName}. Adres: ${COMPANY.address}. Telefon: ${COMPANY.phone}. E-posta: ${COMPANY.email}.`,
      ),
      s(
        "Ürün ve Bedel",
        "Sipariş ettiğiniz ürünlerin temel nitelikleri, tüm vergiler dahil toplam bedeli, teslimat ücreti ve ödeme şekli, siparişi onaylamadan önce sipariş özeti ekranında gösterilir.",
      ),
      s(
        "Cayma Hakkı",
        "Malın tesliminden itibaren 14 gün içinde cayma hakkınız vardır. Çabuk bozulabilen gıda ürünlerinde cayma hakkı istisnası uygulanır (bkz. Mesafeli Satış Sözleşmesi md. 5).",
      ),
      s(
        "Şikâyet ve İtiraz",
        "Talep ve şikâyetlerinizi yukarıdaki iletişim kanallarından iletebilir; çözülemeyen uyuşmazlıklarda Tüketici Hakem Heyeti / Tüketici Mahkemesi'ne başvurabilirsiniz.",
      ),
    ],
  },
  {
    slug: "gizlilik-politikasi",
    title: "Gizlilik Politikası",
    longTitle: "Gizlilik ve Güvenlik Politikası",
    updated: UPDATED,
    sections: [
      p(
        `${COMPANY.brand} olarak kişisel verilerinizin gizliliğine önem veriyoruz. Bu politika, sitemizi kullanırken hangi verileri, hangi amaçla topladığımızı ve nasıl koruduğumuzu açıklar.`,
      ),
      s(
        "Toplanan Veriler",
        "Ad-soyad, telefon, e-posta, teslimat adresi ve sipariş bilgileri; site kullanımına ilişkin teknik veriler (IP, çerezler).",
      ),
      s(
        "Kullanım Amacı",
        "Siparişin oluşturulması, teslimatı, ödemenin alınması, müşteri desteği ve yasal yükümlülüklerin yerine getirilmesi.",
      ),
      s(
        "Ödeme Güvenliği",
        "Kart ile ödemelerde işlemler 3D Secure ve PayTR güvenli ödeme altyapısı üzerinden yürütülür. Kart bilgileriniz sitemizde tutulmaz veya görüntülenmez.",
      ),
      s(
        "Üçüncü Taraflar",
        "Verileriniz yalnızca teslimat (kargo), ödeme (PayTR) ve yasal merciler gibi hizmetin gerektirdiği taraflarla, gerektiği ölçüde paylaşılır; pazarlama amacıyla satılmaz.",
      ),
    ],
  },
  {
    slug: "kvkk",
    title: "KVKK Aydınlatma Metni",
    longTitle: "KVKK Aydınlatma Metni",
    updated: UPDATED,
    sections: [
      s(
        "Veri Sorumlusu",
        `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu ${COMPANY.tradeName}'dir.`,
      ),
      s(
        "İşlenen Veriler ve Amaç",
        "Kimlik, iletişim ve adres verileriniz; sipariş sözleşmesinin kurulması ve ifası, teslimat, ödeme ve muhasebe/yasal yükümlülükler amacıyla işlenir.",
      ),
      s(
        "Hukuki Sebep",
        "KVKK md. 5/2 uyarınca sözleşmenin ifası için gerekli olması ve hukuki yükümlülük; açık rıza gerektiren hallerde rızanıza dayanılır.",
      ),
      s(
        "Haklarınız",
        `KVKK md. 11 kapsamında verilerinize erişme, düzeltme, silme ve işlenmesine itiraz etme haklarına sahipsiniz. Başvurularınızı ${COMPANY.email} adresine iletebilirsiniz.`,
      ),
    ],
  },
  {
    slug: "cerez-politikasi",
    title: "Çerez Politikası",
    longTitle: "Çerez (Cookie) Politikası",
    updated: UPDATED,
    sections: [
      p(
        "Sitemiz, temel işlevlerin çalışması (oturum, sepet) ve deneyimin iyileştirilmesi için çerezler kullanır.",
      ),
      s(
        "Kullanılan Çerezler",
        "Zorunlu çerezler: oturum ve sepet bilgisi (site olmazsa olmaz). Bu çerezler kişisel pazarlama amacıyla kullanılmaz.",
      ),
      s(
        "Çerez Yönetimi",
        "Tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz; ancak zorunlu çerezler engellenirse sepet/oturum düzgün çalışmayabilir.",
      ),
    ],
  },
  {
    slug: "iptal-iade-kosullari",
    title: "İptal ve İade Koşulları",
    longTitle: "İptal, İade ve Cayma Koşulları",
    updated: UPDATED,
    sections: [
      s(
        "Sipariş İptali",
        "Siparişiniz kargoya verilmeden / teslimata çıkmadan önce iptal talebinde bulunabilirsiniz. Kart ile ödenen iptal edilmiş siparişlerin bedeli aynı karta iade edilir.",
      ),
      s(
        "Cayma Hakkı ve İstisnası",
        "Teslimden itibaren 14 gün içinde cayma hakkınız vardır. Çabuk bozulabilen/son kullanma tarihi kısa gıda ürünlerinde (taze süt ürünleri, yumurta vb.) mevzuat gereği cayma hakkı kullanılamaz.",
      ),
      s(
        "İade Süreci",
        `İade talebini ${COMPANY.email} veya ${COMPANY.phone} üzerinden iletin. Uygun iadelerde bedel, ödeme yönteminize göre 14 gün içinde iade edilir. Kart iadeleri PayTR üzerinden aynı karta yapılır.`,
      ),
    ],
  },
  {
    slug: "teslimat-kosullari",
    title: "Teslimat Koşulları",
    longTitle: "Teslimat ve Kargo Koşulları",
    updated: UPDATED,
    sections: [
      s(
        "Teslimat Yöntemleri",
        "Bölge içi taze ürünler kendi teslimat aracımızla seçtiğiniz teslimat gününde; kuru/dayanıklı ürünler (kuru kayısı, dut, pekmez vb.) anlaşmalı kargo ile gönderilir.",
      ),
      s(
        "Süre",
        "Siparişler, seçilen teslimat gününe göre planlanır. Kargo ile gönderimlerde teslimat, kargo firmasının süreçlerine bağlıdır; yasal azami süre 30 gündür.",
      ),
      s(
        "Teslimat Ücreti",
        "Teslimat ücreti sipariş özetinde açıkça gösterilir. Kampanya dönemlerinde ücretsiz teslimat uygulanabilir.",
      ),
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}

/** { slug, title } list for footer/nav rendering. */
export const LEGAL_LINKS: ReadonlyArray<{ slug: string; title: string }> =
  LEGAL_DOCS.map((d) => ({ slug: d.slug, title: d.title }));
