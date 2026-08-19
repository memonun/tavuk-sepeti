/**
 * Legal / compliance content for the storefront (Turkish e-commerce law + what
 * PayTR requires before activating a merchant account).
 *
 * Every legal page and the footer read the seller identity from the same source,
 * so verified business information cannot drift between public documents.
 *
 * Pure data (no JSX / no I/O) so it stays in the domain layer and is easy to
 * diff/translate. The UI (legal-article.tsx / shop-footer.tsx) renders it.
 */

export interface Company {
  /** Ticari ünvan — legal company name (or şahıs şirketi full name). */
  readonly tradeName: string;
  /** Short brand shown in the footer/UI. */
  readonly brand: string;
  /** Verified owner / authorised person shown in the public legal identity. */
  readonly ownerName: string;
  readonly address: string;
  readonly phone: string;
  readonly email: string;
  readonly taxOffice: string; // Vergi Dairesi
  readonly taxNo: string; // Vergi / TC Kimlik No
  readonly mersisNo: string; // "" if not verified
  readonly kepAddress: string; // "" if not verified
  readonly tradeRegistryNo: string; // Ticaret sicil no ("" if unavailable)
  /** Public site URL (root domain). */
  readonly siteUrl: string;
  /** ETBİS doğrulama/kayıt bağlantısı (footer badge links here). */
  readonly etbisUrl: string;
}

/** Exact public marker for a required legal detail not verified in this repo. */
export const PENDING_LEGAL_INFORMATION = "sonra eklenicek";

// Only verified facts are filled in here. Empty official-identifier fields are
// rendered as PENDING_LEGAL_INFORMATION in public legal documents.
export const COMPANY: Company = {
  tradeName: "Hamit Apuhan",
  brand: "Apuhan Çiftliği",
  ownerName: "Hamit Apuhan",
  address: "Bahri Mah. Mezarlık Cad. No: 17, Akçadağ / Malatya",
  phone: "+90 533 255 64 44",
  email: "hamitapuhanlive@gmail.com",
  taxOffice: "Akçadağ",
  taxNo: "0710634448",
  mersisNo: "",
  kepAddress: "",
  tradeRegistryNo: "",
  // Apex (www YOK) ve punycode değil: PayTR'nin panelde kilitli "SİTE ADRESİNİZ"
  // alanı tam olarak bu — NEXT_PUBLIC_APP_URL ile birebir aynı kalmalı, yoksa
  // ödeme sayfası "API bilgileri sadece ... için tanımlıdır" diye reddediyor.
  siteUrl: "https://apuhanciftligi.com",
  etbisUrl: "https://etbis.ticaret.gov.tr/",
};

export interface LegalSection {
  readonly heading?: string;
  readonly paragraphs: readonly string[];
  /** Optional, visible references used where a public guide should link out. */
  readonly links?: readonly LegalSectionLink[];
}

export interface LegalSectionLink {
  readonly href: string;
  readonly title: string;
}

export interface LegalDoc {
  readonly slug: string;
  /** Footer + nav label. */
  readonly title: string;
  /** Longer <title>/heading. */
  readonly longTitle: string;
  readonly updated: string; // YYYY-MM-DD, shown as "son güncelleme"
  readonly sections: readonly LegalSection[];
  /** Slugs of other legal docs to cross-link at the bottom of the page
   *  ("İlgili hukuki metinler") — real navigable links, since these
   *  paragraphs are plain strings and can't carry inline JSX links. */
  readonly relatedSlugs?: readonly string[];
}

/**
 * The two documents a customer must acknowledge before a one-time web order.
 *
 * Keep a new version value for each substantive document revision. The order
 * record stores these references with its acceptance timestamp, so a later
 * edit to the public page does not erase which revision a past order accepted.
 */
export const SALES_LEGAL_ACCEPTANCE_DOCUMENTS = [
  { slug: "on-bilgilendirme-formu", version: "2026-08-19" },
  { slug: "mesafeli-satis-sozlesmesi", version: "2026-08-19" },
] as const;

export interface SalesLegalAcceptance {
  readonly accepted_at: string;
  readonly documents: ReadonlyArray<{
    readonly slug: (typeof SALES_LEGAL_ACCEPTANCE_DOCUMENTS)[number]["slug"];
    readonly version: string;
  }>;
}

/** A minimal, non-sensitive record suitable for the immutable order row. */
export function createSalesLegalAcceptance(acceptedAt: Date): SalesLegalAcceptance {
  return {
    accepted_at: acceptedAt.toISOString(),
    documents: SALES_LEGAL_ACCEPTANCE_DOCUMENTS.map((document) => ({ ...document })),
  };
}

const p = (...paragraphs: string[]): LegalSection => ({ paragraphs });
const s = (heading: string, ...paragraphs: string[]): LegalSection => ({
  heading,
  paragraphs,
});

const sWithLinks = (
  heading: string,
  paragraphs: readonly string[],
  links: readonly LegalSectionLink[],
): LegalSection => ({ heading, paragraphs, links });

const missingLegalInformation = (value: string): string =>
  value.trim() || PENDING_LEGAL_INFORMATION;

/** One source for the full seller identity required across public legal pages. */
export const SELLER_IDENTITY_LINES = [
  `Satıcı / İşletme Adı: ${COMPANY.tradeName}`,
  `Marka: ${COMPANY.brand}`,
  `Yetkili Kişi / İşletme Sahibi: ${COMPANY.ownerName}`,
  `Açık Adres: ${COMPANY.address}`,
  `Telefon: ${COMPANY.phone}`,
  `E-posta: ${COMPANY.email}`,
  `Web Sitesi: ${COMPANY.siteUrl}`,
  `Vergi Dairesi: ${COMPANY.taxOffice}`,
  `Vergi Kimlik Numarası: ${missingLegalInformation(COMPANY.taxNo)}`,
  `KEP Adresi: ${missingLegalInformation(COMPANY.kepAddress)}`,
  `MERSİS Numarası: ${missingLegalInformation(COMPANY.mersisNo)}`,
  `Ticaret Sicil Numarası: ${missingLegalInformation(COMPANY.tradeRegistryNo)}`,
] as const;

const sellerIdentitySection = (
  heading = "Satıcı / İşletme Bilgileri",
  introduction?: string,
): LegalSection =>
  s(heading, ...(introduction ? [introduction] : []), ...SELLER_IDENTITY_LINES);

const WITHDRAWAL_TIMING =
  "Kanuni istisnalar saklı kalmak üzere tüketici, herhangi bir gerekçe göstermeden ve cezai şart ödemeden cayma hakkını sözleşmenin kurulduğu tarihten malın teslimine kadar olan sürede veya malın tesliminden itibaren on dört gün içinde kullanabilir.";

const WITHDRAWAL_EXCEPTIONS =
  "Çabuk bozulabilen veya son kullanma tarihi geçebilecek mallar; teslimden sonra koruyucu ambalajı açılmış, sağlık ve hijyen açısından iadesi uygun olmayan mallar; ayrıca yalnızca tüketicinin istekleri ya da kişisel ihtiyaçları doğrultusunda hazırlanan mallar bakımından, somut olayda mevzuattaki şartlar oluştuğu ölçüde cayma hakkı istisnaları uygulanabilir. Bir ürünün yalnızca gıda olması, tek başına cayma hakkının bulunmadığı anlamına gelmez.";

const WITHDRAWAL_NOTICE =
  "Cayma bildiriminizi yazılı olarak veya kalıcı veri saklayıcısı yoluyla e-posta adresimize iletebilirsiniz. Bildirimde sipariş numarasını, ad ve soyadınızı, siparişte kullanılan telefon veya e-posta bilgisini ve talebinizi belirtmeniz işlemin doğru siparişle eşleştirilmesine yardımcı olur. Telefon ve WhatsApp, destek ve bilgi alma kanalı olarak kullanılabilir.";

const REFUND_TIMING =
  "Cayma hakkının geçerli olduğu hallerde, tahsil edilen ödemeler cayma bildiriminin satıcıya ulaştığı tarihten itibaren en geç on dört gün içinde, tüketicinin satın alırken kullandığı ödeme aracına uygun şekilde iade edilir. Tüketicinin malı geri göndermesi gereken hallerde, satıcı malın geri gönderildiğini gösteren kanıt ulaşana veya mal teslim alınıncaya kadar, hangisi önce gerçekleşirse o ana kadar geri ödemeyi bekletebilir.";

const RETURN_DETAILS_PENDING = [
  `Öngörülen İade Taşıyıcısı: ${PENDING_LEGAL_INFORMATION}`,
  `İade Gönderim Masrafı: ${PENDING_LEGAL_INFORMATION}`,
] as const;

const SALES_LEGAL_UPDATED = "2026-08-19";
const UPDATED_2 = "2026-08-18";

export const LEGAL_DOCS: readonly LegalDoc[] = [
  {
    slug: "mesafeli-satis-sozlesmesi",
    title: "Mesafeli Satış Sözleşmesi",
    longTitle: "Mesafeli Satış Sözleşmesi",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "on-bilgilendirme-formu",
      "iptal-iade-kosullari",
      "teslimat-kosullari",
      "kvkk",
      "duzenli-siparis-kosullari",
      "islem-rehberi",
    ],
    sections: [
      s(
        "1. Taraflar",
        "SATICI bilgileri aşağıdadır.",
        ...SELLER_IDENTITY_LINES,
        "ALICI: Siparişi veren müşteri. ALICI'ya ait iletişim ve teslimat bilgileri sipariş formu ile sipariş kaydında yer alır; bu bilgiler statik sözleşme sayfasında gösterilmez.",
      ),
      s(
        "2. Konu",
        "Bu sözleşme; ALICI'nın SATICI'ya ait internet sitesinde elektronik ortamda verdiği siparişin satışı, ödemesi, teslimi ve tarafların temel hak ve yükümlülüklerini 6502 sayılı Tüketicinin Korunması Hakkında Kanun ile uygulanabilir Mesafeli Sözleşmeler Yönetmeliği çerçevesinde açıklar.",
      ),
      s(
        "3. Ürünler, Fiyat ve Toplam Bedel",
        "Siparişe konu ürünlerin temel nitelikleri, miktarları, güncel birim ve ara toplam fiyatları sipariş özeti ile sipariş kaydında gösterilir. Varsa teslimat veya kargo bedeli, indirimler ve toplam ödeme tutarı da müşteri siparişini göndermeden önce ekranda açıkça yer alır. Geçerli tutarlar sipariş sırasında gösterilen tutarlardır.",
      ),
      s(
        "4. Ödeme Yöntemleri",
        "Siparişin teslimat kanalına göre kredi/banka kartı ile PayTR ödeme sayfası üzerinden ödeme, havale/EFT veya kapıda nakit ödeme sunulabilir. Kapıda nakit ödeme yalnızca eve teslimat kanalında kullanılabilir; kargo siparişlerinde kart veya havale/EFT seçenekleri gösterilir. Kart bilgilerinin girildiği ödeme işlemi PayTR'nin ödeme sayfasında yürütülür; kart numarası ve CVV gibi bilgiler SATICI'nın sipariş formunda istenmez.",
      ),
      s(
        "5. Siparişin Kurulması ve Belgeler",
        "Müşteri; ürünleri, miktarları, teslimat bilgilerini, toplam bedeli ve ödeme yöntemini kontrol ettikten; Ön Bilgilendirme Formu ile Mesafeli Satış Sözleşmesi'ni inceleyip satış koşullarını kabul ettikten sonra siparişini gönderir. Bu kabul, sipariş kaydıyla birlikte kabul edilen belge sürümleri ve zaman bilgisiyle saklanır. Kart ödemesinde ödeme işlemi ayrıca PayTR akışında tamamlanır.",
      ),
      s(
        "6. Teslimat",
        "Ürünün niteliği ve teslimat adresine göre sipariş eve/yerel teslimat veya kargo kanalıyla gönderilir. Eve teslimat için seçilebilir teslimat günleri ve varsa zaman aralığı ödeme ekranında gösterilir. Kargo siparişlerinde gönderim, ürün hazırlık sürecinden sonra yapılır. Teslimat, mevzuatta öngörülen azami süre ve istisnalar çerçevesinde gerçekleştirilir.",
      ),
      s(
        "7. Cayma Hakkı ve İstisnaları",
        WITHDRAWAL_TIMING,
        WITHDRAWAL_EXCEPTIONS,
      ),
      s(
        "8. Ayıplı, Hasarlı veya Yanlış Ürün",
        "Cayma hakkına ilişkin istisnalar, ALICI'nın ayıplı mal hükümlerinden doğan yasal haklarını ortadan kaldırmaz. Yanlış, eksik, bozuk veya taşıma sırasında hasar görmüş bir ürün teslim alınırsa ALICI, SATICI'nın mevcut iletişim kanallarından durumu bildirebilir.",
      ),
      s(
        "9. İptal ve Geri Ödeme",
        "Henüz hazırlanmamış, teslimata çıkmamış veya kargoya verilmemiş siparişler için iptal talebinizi e-posta, telefon veya WhatsApp destek kanalı üzerinden iletebilirsiniz. Sitede otomatik iptal ekranı bulunmadığından, talep siparişin güncel operasyonel durumuna göre değerlendirilir.",
        WITHDRAWAL_NOTICE,
        REFUND_TIMING,
        "İade gönderimine ilişkin işletmeye özgü taşıyıcı ve masraf bilgileri İptal ve İade Koşulları'nda belirtilir.",
      ),
      s(
        "10. Uyuşmazlıklar",
        "İşbu sözleşmeden doğabilecek uyuşmazlıklarda, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dahilinde ALICI'nın yerleşim yerindeki Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri yetkilidir.",
      ),
    ],
  },
  {
    slug: "on-bilgilendirme-formu",
    title: "Ön Bilgilendirme Formu",
    longTitle: "Ön Bilgilendirme Formu",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "mesafeli-satis-sozlesmesi",
      "iptal-iade-kosullari",
      "teslimat-kosullari",
      "kvkk",
      "duzenli-siparis-kosullari",
      "islem-rehberi",
    ],
    sections: [
      sellerIdentitySection("Satıcı Bilgileri"),
      s(
        "Ürünün Temel Nitelikleri ve Satış Bedeli",
        "Sipariş ettiğiniz ürünlerin temel nitelikleri, miktarları ve güncel satış fiyatları sipariş özeti ekranında gösterilir. Siparişe uygulanıyorsa teslimat/kargo bedeli, indirimler ve toplam ödeme tutarı da siparişi göndermeden önce aynı ekranda yer alır. Vergiler konusunda sipariş ekranında gösterilen güncel bilgiler esas alınır.",
      ),
      s(
        "Teslimat ve Ödeme",
        "Ürünün niteliği ile teslimat adresine göre eve/yerel teslimat veya kargo yöntemi uygulanır. Eve teslimat günleri ve varsa zaman aralığı seçilebilir olarak gösterilir; kargo siparişleri için teslimat günü seçilmez. Ödeme seçenekleri siparişin teslimat kanalına göre gösterilir: kart ödemesi PayTR ödeme sayfası üzerinden, havale/EFT her iki kanalda, kapıda nakit ise yalnızca eve teslimatta sunulabilir.",
      ),
      s(
        "Sipariş Öncesi Bilgiler",
        "Ödeme yükümlülüğü doğmadan önce sipariş özeti; ürünleri, adet/miktarları, ara toplamı, varsa teslimat veya kargo bedelini, toplamı, teslimat yöntemini, seçilen adresi, uygulanıyorsa teslimat günü/zaman aralığını ve ödeme yöntemini gösterir. Bu bilgiler, siparişe özgü Ön Bilgilendirme'nin esasını oluşturur.",
      ),
      s(
        "Cayma Hakkı",
        WITHDRAWAL_TIMING,
        WITHDRAWAL_EXCEPTIONS,
      ),
      s(
        "İade ve Şikâyet",
        WITHDRAWAL_NOTICE,
        REFUND_TIMING,
        "Yanlış, eksik, hasarlı veya ayıplı ürünlere ilişkin yasal haklarınız saklıdır. Ayrıntılı iade süreci ve işletmeye özgü taşıyıcı/masraf bilgileri için İptal ve İade Koşulları'nı inceleyebilirsiniz.",
      ),
      s(
        "Şikâyet ve İtiraz",
        "Çözülemeyen tüketici uyuşmazlıklarında, Ticaret Bakanlığı tarafından her yıl belirlenen parasal sınırlar çerçevesinde Tüketici Hakem Heyeti'ne veya Tüketici Mahkemesi'ne başvurabilirsiniz.",
      ),
    ],
  },
  {
    slug: "gizlilik-politikasi",
    title: "Gizlilik Politikası",
    longTitle: "Gizlilik Politikası",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "kvkk",
      "cerez-politikasi",
      "mesafeli-satis-sozlesmesi",
      "kullanim-sartlari",
      "islem-rehberi",
    ],
    sections: [
      p(
        `${COMPANY.brand} olarak; sitemizi ziyaret ettiğinizde, müşteri hesabı oluşturduğunuzda, sipariş verdiğinizde, siparişinizi sorguladığınızda veya bizimle iletişime geçtiğinizde işlenen kişisel verilerinizin gizliliğine önem veriyoruz. Bu Gizlilik Politikası, hangi kişisel verilerin hangi amaçlarla işlendiğini, kimlerle paylaşılabileceğini ve KVKK kapsamındaki haklarınızı açıklamak amacıyla hazırlanmıştır.`,
      ),
      sellerIdentitySection(
        "Veri Sorumlusu ve İletişim Bilgileri",
        `Kişisel verilerinizin işlenmesinden ${COMPANY.brand} (${COMPANY.tradeName}) sorumludur.`,
      ),
      s(
        "Kimlik ve İletişim Bilgileri",
        "Hesap oluşturduğunuzda veya sipariş verdiğinizde ad, soyad, telefon numarası ve e-posta adresiniz alınır; bu bilgiler siparişin oluşturulması ve sizinle iletişime geçilebilmesi için kullanılır.",
      ),
      s(
        "Teslimat Adresi Bilgileri",
        "Siparişinizin teslim edilebilmesi için adres bilgileriniz ve varsa teslimatla ilgili notlarınız işlenir. Adresin haritada gösterilmesi ve konumunun belirlenmesi Google Haritalar altyapısı üzerinden yapılır.",
      ),
      s(
        "Hesap ve Oturum Bilgileri",
        "Müşteri hesabı oluşturursanız, giriş bilgileriniz ve oturumunuz kimlik doğrulama altyapımız olan Supabase üzerinden yönetilir. Şifreniz tarafımızca okunabilir biçimde saklanmaz.",
      ),
      s(
        "Sipariş Bilgileri",
        "Sipariş numarası, sipariş edilen ürünler ve miktarları, tutar, seçilen teslimat günü ve yöntemi (bölge içi teslimat veya kargo), ödeme yöntemi, sipariş notları ve sipariş durumu, siparişinizin yürütülmesi amacıyla kaydedilir.",
      ),
      s(
        "Düzenli Sipariş Bilgileri",
        "Düzenli sipariş talebinde bulunursanız, seçtiğiniz ürünler ve teslimat sıklığı; talebiniz onaylandıktan sonra ilgili tarihlerde sizin adınıza otomatik olarak sipariş oluşturmak amacıyla saklanır. Bu, kartınızdan otomatik tahsilat yapıldığı anlamına gelmez — düzenli siparişler yalnızca kapıda ödeme veya havale/EFT ile ödenir.",
      ),
      s(
        "Sipariş Sorgulama Bilgileri",
        "Hesabınız yoksa, siparişte kullandığınız telefon numarası veya sipariş numaranız ile siparişinizin durumunu sorgulayabilirsiniz. Bu sorgulama sırasında girdiğiniz bilgiler yalnızca ilgili siparişi bulmak amacıyla kullanılır.",
      ),
      s(
        "Ödeme Bilgileri",
        "Kredi/banka kartı ile ödemede işlem PayTR güvenli ödeme altyapısı üzerinden yürütülür; kart numarası, son kullanma tarihi ve CVV gibi bilgiler sitemizde veya sunucularımızda tutulmaz, doğrudan PayTR'ye iletilir. Havale/EFT ile ödemede yalnızca ödemeyi eşleştirebilmemiz için sipariş ve iletişim bilgileriniz kullanılır.",
      ),
      s(
        "Teknik Kullanım Bilgileri",
        "Sitenin güvenli ve düzgün çalışmasını sağlamak amacıyla IP adresi, tarayıcı bilgisi ve erişim kayıtları gibi teknik veriler, barındırma altyapımız (Vercel) tarafından işlenebilir.",
      ),
      s(
        "Kişisel Verilerin İşlenme Amaçları",
        "Verileriniz; sipariş oluşturma ve yürütme, ödeme işlemlerinin gerçekleştirilmesi, teslimatın yapılması, sipariş durumunun sorgulanabilmesi, müşteri hesabının yönetilmesi, sipariş onayı ve bilgilendirme e-postalarının gönderilmesi, müşteri talep ve şikâyetlerinin yanıtlanması ile yasal yükümlülüklerin yerine getirilmesi amacıyla işlenir.",
      ),
      s(
        "Hukuki Sebepler",
        "Kişisel verileriniz; aramızdaki sözleşmenin kurulması ve ifası, hukuki yükümlülüklerimizin yerine getirilmesi ve meşru menfaatlerimiz kapsamında, KVKK'nın ilgili hükümlerine dayanılarak işlenir. Açık rızanızın gerekli olduğu haller ayrıca ilgili işlem sırasında belirtilir.",
      ),
      s(
        "Çerezler ve Yerel Depolama",
        "Oturum açtığınızda kimlik doğrulama bilginiz, Supabase altyapısı tarafından güvenli çerezlerde tutulur. Sepetinizdeki ürünler ise çerez değildir; yalnızca kendi tarayıcınızda (localStorage) saklanır ve sunucularımıza gönderilmez. Sitemizde reklam veya pazarlama amaçlı çerez ya da izleme teknolojisi kullanılmaz. Ayrıntılar için Çerez Politikamıza bakabilirsiniz.",
      ),
      s(
        "Üçüncü Taraf Hizmet Sağlayıcılar",
        "Teknik işleyişte kullanılan sağlayıcılar ve işledikleri veri kategorileri, hizmete göre farklılaşır: Supabase, müşteri hesabı/oturum, iletişim, adres ve sipariş kayıtlarının altyapısında; PayTR, kartla ödeme seçildiğinde ödeme işlemi için gerekli iletişim, sipariş, tutar ve kart ödeme verilerinde; Resend, e-posta adresi verilmiş ve e-posta gönderimi yapılandırılmış siparişlerde onay e-postasında; Google Haritalar, harita veya adres arama kullanıldığında konum ve adres arama verilerinde; Vercel ise siteye erişimin sunulmasıyla bağlantılı teknik günlük verilerinde rol alabilir.",
        "Bu metin, her sağlayıcının her siparişte aynı veri kategorisini işlediği anlamına gelmez. Sağlayıcıya yalnızca ilgili hizmetin çalışması için gerekli veri aktarılır.",
      ),
      s(
        "WhatsApp Üzerinden İletişim",
        "Sitedeki WhatsApp bağlantısı, sizi WhatsApp uygulamasına yönlendiren basit bir bağlantıdır; buradan başlattığınız görüşmeler WhatsApp'ın kendi hizmet şartlarına tabidir.",
      ),
      s(
        "Kişisel Verilerin Yurt İçinde Aktarılması",
        "Kişisel verileriniz, hizmetin yürütülmesi için gerekli olduğu ölçüde ödeme hizmet sağlayıcısına, teknik altyapı sağlayıcılarına ve mevzuatın gerektirdiği hallerde yetkili kamu kurumlarına aktarılabilir. Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz veya kiralanmaz.",
      ),
      s(
        "Kişisel Verilerin Yurt Dışına Aktarılması",
        "Kullanılan teknik sağlayıcıların veri merkezi konumu veya hizmetin destek altyapısı nedeniyle kişisel verilerin yurt dışında işlenmesi gündeme gelebilir. Bu sayfada, belirli bir ülke, sağlayıcı hesabı veya aktarımın hukuki mekanizması için doğrulanmış bir kayıt bulunmadığından; standart sözleşme, açık rıza, yeterlilik kararı ya da başka bir mekanizmanın kullanıldığı beyan edilmez.",
        "Yurt dışına kişisel veri aktarımı gerektiğinde, somut aktarım için KVKK'nın 9 uncu maddesindeki şartlar ve uygulanabilir ek yükümlülükler sağlanmalıdır.",
        `Yurt Dışı Aktarım Mekanizması: ${PENDING_LEGAL_INFORMATION}`,
      ),
      s(
        "Saklama Süresi",
        "Kişisel verileriniz, işlendikleri amaç için gerekli olduğu ve ilgili mevzuatın (özellikle muhasebe ve tüketici mevzuatı) öngördüğü süre boyunca saklanır; bu süre sona erdiğinde silinir veya anonim hale getirilir.",
      ),
      s(
        "Veri Güvenliği",
        "Kişisel verilerinizin yetkisiz erişime, kayba veya kötüye kullanıma karşı korunması için makul teknik ve idari önlemler alınır. Ancak internet üzerinden yapılan hiçbir veri aktarımının veya elektronik saklamanın mutlak güvenliği garanti edilemez.",
      ),
      s(
        "KVKK Kapsamındaki Haklarınız",
        `6698 sayılı KVKK'nın 11. maddesi kapsamında; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, eksik/yanlış verilerin düzeltilmesini isteme, mevzuatta öngörülen şartlarda silinmesini isteme ve işlenmesine itiraz etme haklarına sahipsiniz. Ayrıntılar için KVKK Aydınlatma Metni'ni inceleyebilir, taleplerinizi ${COMPANY.email} adresine iletebilirsiniz. Kimliğinizi doğrulamak için makul ek bilgi istenebilir.`,
      ),
      s(
        "Üçüncü Taraf Bağlantılar",
        "Sitede üçüncü taraf sitelere bağlantılar bulunabilir. Bu sitelerin içerik ve gizlilik uygulamaları bizim kontrolümüz dışındadır.",
      ),
      s(
        "Değişiklikler",
        "Bu Gizlilik Politikası, sitenin teknik altyapısında, hizmetlerinde veya yasal gerekliliklerde değişiklik olması halinde güncellenebilir; güncel sürüm bu sayfada, üstte belirtilen tarihle birlikte yayımlanır.",
      ),
    ],
  },
  {
    slug: "kvkk",
    title: "KVKK Aydınlatma Metni",
    longTitle: "KVKK Aydınlatma Metni",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "iptal-iade-kosullari",
      "teslimat-kosullari",
      "gizlilik-politikasi",
      "cerez-politikasi",
      "islem-rehberi",
    ],
    sections: [
      sellerIdentitySection(
        "Veri Sorumlusu",
        `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu ${COMPANY.brand} (${COMPANY.tradeName})'dir.`,
      ),
      s(
        "İşlenen Veri Kategorileri",
        "Sipariş, hesap veya düzenli sipariş talebi sürecinde ad, soyad, telefon, e-posta, teslimat adresi ve konum bilgisi, sipariş/ürün/tutar bilgisi, seçilen ödeme yöntemi, teslimat bilgileri ve sipariş sorgulama verileri işlenebilir. Hesap kullanıldığında kimlik doğrulama ve oturum bilgileri; hizmetin güvenliği ve çalışması için IP adresi, tarayıcı ve erişim kayıtları gibi teknik veriler de işlenebilir.",
      ),
      s(
        "İşleme Amaçları",
        "Veriler; müşteri hesabının yönetilmesi, siparişin kurulması ve yürütülmesi, ödeme ve teslimat süreçlerinin işletilmesi, sipariş durumunun sorgulanması, düzenli sipariş talebinin değerlendirilmesi ve onaylanması, iletişim kurulması, güvenliğin sağlanması, muhasebe ile yasal yükümlülüklerin yerine getirilmesi amaçlarıyla işlenir.",
      ),
      s(
        "Toplama Yöntemi ve Hukuki Sebepler",
        "Veriler; internet sitesi formları, hesap ve oturum işlemleri, sipariş/sipariş sorgulama ekranları, ödeme işlemi ve teknik kayıtlar aracılığıyla otomatik veya kısmen otomatik yollarla toplanabilir. İşleme, somut işleme faaliyetine göre sözleşmenin kurulması veya ifası için gerekli olması, hukuki yükümlülüğün yerine getirilmesi, bir hakkın tesisi/kullanılması/korunması ya da meşru menfaat gibi KVKK'daki uygun şartlara dayanabilir. Açık rıza gereken ayrı işlemler ayrıca sunulur; bu aydınlatma metni zorunlu bir açık rıza değildir.",
      ),
      s(
        "Aktarım Alıcıları ve Amaçları",
        "Veriler, hizmetin yürütülmesi için gerekli olduğu ölçüde ve kullanılan hizmete bağlı olarak aktarılabilir: Supabase'e hesap/oturum, iletişim, adres ve sipariş verileri; PayTR'ye kartla ödeme seçildiğinde iletişim, sipariş, tutar ve ödeme verileri; Resend'e e-posta gönderimi yapılandırılmış ve e-posta adresi verilmiş siparişlerde e-posta iletimi için gerekli veriler; Google Haritalar'a harita veya adres arama kullanıldığında konum/adres arama verileri; Vercel'e sitenin sunulmasıyla bağlantılı teknik günlük verileri aktarılabilir. Mevzuatın gerektirdiği hallerde yetkili kamu kurum ve kuruluşlarına da aktarım yapılabilir.",
      ),
      s(
        "Kişisel Verilerin Yurt Dışına Aktarılması",
        "Kullanılan teknik sağlayıcıların veri merkezi konumu veya hizmetin destek altyapısı nedeniyle kişisel verilerin yurt dışında işlenmesi gündeme gelebilir. Bu sayfada belirli bir ülke, sağlayıcı hesabı veya aktarım mekanizmasını doğrulayan bilgi bulunmadığından; standart sözleşme, açık rıza, yeterlilik kararı ya da başka bir aktarım mekanizmasının kullanıldığı yönünde beyanda bulunulmaz.",
        "Yurt dışına aktarım gerektiğinde, her somut aktarım için KVKK'nın 9 uncu maddesindeki şartlar ve uygulanabilir ek yükümlülükler sağlanmalıdır.",
        `Yurt Dışı Aktarım Mekanizması: ${PENDING_LEGAL_INFORMATION}`,
      ),
      s(
        "KVKK Kapsamındaki Haklar ve Başvuru",
        `KVKK'nın 11. maddesi kapsamındaki bilgi alma, düzeltme, silme/yok etme, aktarılan kişileri öğrenme, itiraz etme ve şartları oluştuğunda zararın giderilmesini talep etme haklarınızı kullanabilirsiniz. Başvurunuzu kimliğinizi doğrulamaya elverişli bilgilerle ${COMPANY.email} adresine iletebilirsiniz.`,
      ),
    ],
  },
  {
    slug: "cerez-politikasi",
    title: "Çerez Politikası",
    longTitle: "Çerez (Cookie) Politikası",
    updated: UPDATED_2,
    sections: [
      p(
        "Sitemiz, yalnızca oturumunuzun açık kalması gibi temel işlevler için zorunlu çerez kullanır. Reklam veya pazarlama amaçlı çerez ya da izleme teknolojisi kullanılmaz.",
      ),
      s(
        "Kullanılan Çerezler",
        "Zorunlu çerez: giriş yaptıysanız oturumunuzun açık kalması için kullanılır (site olmazsa olmaz). Bu çerez kişisel pazarlama amacıyla kullanılmaz.",
      ),
      s(
        "Sepet ve Yerel Depolama",
        "Sepetinizdeki ürünler çerez değildir; yalnızca kendi tarayıcınızda (localStorage) tutulur ve sunucularımıza gönderilmez.",
      ),
      s(
        "Çerez Yönetimi",
        "Tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz; ancak zorunlu oturum çerezi engellenirse giriş yapmış olarak kalamayabilirsiniz.",
      ),
    ],
  },
  {
    slug: "iptal-iade-kosullari",
    title: "İptal ve İade Koşulları",
    longTitle: "İptal, İade ve Cayma Koşulları",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "teslimat-kosullari",
      "kvkk",
    ],
    sections: [
      sellerIdentitySection(),
      s(
        "Sipariş İptali",
        "Sitede otomatik sipariş iptal ekranı bulunmaz. Henüz hazırlanmamış, teslimata çıkmamış veya kargoya verilmemiş bir sipariş için e-posta, telefon veya WhatsApp destek kanalı üzerinden iptal talebi iletebilirsiniz. Talebinizde sipariş numarasını, ad ve soyadınızı, siparişte kullanılan telefon veya e-posta bilgisini belirtmeniz işlemin doğru siparişle eşleştirilmesine yardımcı olur.",
        "İptal talebi, siparişin o andaki operasyonel durumuna göre değerlendirilir. Teslimata çıkmış veya kargoya verilmiş siparişlerde, cayma hakkı ve ayıplı mal hakları saklı kalmak üzere otomatik iptal yapılamayabilir.",
      ),
      s(
        "Cayma Hakkı Bulunan Ürünler",
        WITHDRAWAL_TIMING,
      ),
      s(
        "Cayma Hakkı İstisnaları",
        WITHDRAWAL_EXCEPTIONS,
      ),
      s(
        "Cayma Bildirimi ve İade Süreci",
        WITHDRAWAL_NOTICE,
        "Bildirim ulaştıktan sonra, talebin cayma hakkı kapsamında olup olmadığı ve ürünün geri gönderilmesi gerekiyorsa izlenecek teslim/taşıma adımı değerlendirilir. Gerekli iade adımları, ürünün niteliği ve siparişin teslimat yöntemine göre yazılı olarak paylaşılır.",
      ),
      s(
        "İade Taşıyıcısı ve Gönderim Masrafı",
        ...RETURN_DETAILS_PENDING,
        "Bu bilgiler, tüketici mevzuatından doğan hakları sınırlayacak şekilde yorumlanamaz.",
      ),
      s(
        "Yanlış, Eksik, Hasarlı veya Ayıplı Ürün",
        `Yanlış, eksik, taşıma sırasında hasar görmüş veya bozuk/ayıplı olduğunu düşündüğünüz ürün için ${COMPANY.email} ya da ${COMPANY.phone} üzerinden bizimle iletişime geçebilirsiniz. Cayma hakkı istisnası, ayıplı maldan doğan yasal haklarınızı sınırlamaz.`,
      ),
      s(
        "Geri Ödeme",
        REFUND_TIMING,
      ),
    ],
  },
  {
    slug: "teslimat-kosullari",
    title: "Teslimat Koşulları",
    longTitle: "Teslimat ve Kargo Koşulları",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "iptal-iade-kosullari",
      "kvkk",
      "duzenli-siparis-kosullari",
      "islem-rehberi",
    ],
    sections: [
      sellerIdentitySection(),
      s(
        "Teslimat Yöntemleri",
        "Ürünün niteliği ve teslimat adresine göre sipariş eve/yerel teslimat veya kargo kanalıyla yürütülür. Eve teslimat, Malatya'daki hizmet alanı için sunulur; hizmet alanının güncel kapsamı ve ürünün uygun teslimat yöntemi sipariş ekranında belirlenir. Kargoya uygun ürünler Türkiye geneline gönderilebilir.",
      ),
      s(
        "Teslimat Günleri ve Sipariş Tutarı",
        "Eve teslimat için mevcut teslimat günleri ve varsa zaman aralığı ödeme ekranında seçilebilir olarak gösterilir. Geçerli minimum sipariş tutarı, teslimat/kargo bedeli ve toplam tutar sipariş sırasında ekranda gösterilir; bu değişkenler bu sayfada sabitlenmez.",
      ),
      s(
        "Teslimat Adresi ve Teslim Edilememe",
        "Müşteri, doğru iletişim bilgisi ile açık adres, bina ve kapı/daire bilgisini sağlamakla sorumludur. Müşteriye ulaşılamaması veya adres bilgisinin yetersiz olması halinde teslimatın nasıl sürdürüleceği, siparişin somut operasyonel durumuna göre müşteriyle değerlendirilir.",
      ),
      s(
        "Kargo Teslimi",
        "Kargo tesliminde görünür bir hasar olup olmadığını kontrol etmeniz önerilir. Ancak kargo görevlisiyle tutanak tutulmamış olması, tüketici mevzuatından doğan haklarınızı tek başına ortadan kaldırmaz. Hasar, eksik veya yanlış ürün halinde mevcut iletişim kanallarından bize ulaşabilirsiniz.",
      ),
    ],
  },
  {
    slug: "duzenli-siparis-kosullari",
    title: "Düzenli Sipariş Koşulları",
    longTitle: "Düzenli Sipariş Koşulları",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "teslimat-kosullari",
      "iptal-iade-kosullari",
      "kvkk",
      "islem-rehberi",
    ],
    sections: [
      sellerIdentitySection(),
      s(
        "Nasıl Çalışır",
        "Düzenli Sipariş, hesabınızdan seçtiğiniz ürünler ve haftalık veya iki haftada bir teslimat sıklığı için bir talep oluşturmanızı sağlar. Talep önce ekip tarafından değerlendirilir; onaylanmadıkça düzenli sipariş oluşturulmaz.",
      ),
      s(
        "Oluşturulan Siparişler ve Fiyatlar",
        "Onaylanan talep için sistem, seçtiğiniz periyotlarda yeni siparişler oluşturur. Bu oluşturma için her seferinde ayrıca müşteri onayı alınmaz. Her sipariş, oluşturulduğu tarihteki güncel katalog ve fiyat bilgileriyle hesaplanır; talebin oluşturulduğu tarihteki fiyatların gelecekte sabit kalacağı taahhüt edilmez. Ürün uygunluğu değişirse sipariş oluşturulamayabilir.",
      ),
      s(
        "Ödeme ve Teslimat",
        "Düzenli siparişlerde karttan otomatik tahsilat yapılmaz. Kullanılabilen ödeme yöntemleri, siparişin teslimat kanalına göre kapıda nakit ödeme veya havale/EFT'dir. Talepte seçilen teslimat günü, düzenli sipariş formunda müşteriye sunulan günlerden seçilir. Hesabınızdaki Düzenli Siparişlerim alanında talebinizin durumu ile aktif talepler için sıradaki tarih gösterilir.",
      ),
      s(
        "Durdurma ve İptal",
        "Hesabınızdaki Düzenli Siparişlerim alanından talebinizi iptal edebilirsiniz. İptal edildiğinde yeni düzenli sipariş oluşturulmaz ve yalnızca henüz beklemede olan, bu talepten üretilmiş siparişler iptal edilir. Onaylanmış, hazırlanmış, teslimata çıkmış veya kargoya verilmiş bir sipariş otomatik olarak iptal edilmez; bu siparişler için İptal ve İade Koşulları ile ilgili siparişin Mesafeli Satış Sözleşmesi uygulanır.",
      ),
    ],
  },
  {
    slug: "islem-rehberi",
    title: "İşlem Rehberi",
    longTitle: "İşlem Rehberi",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "on-bilgilendirme-formu",
      "mesafeli-satis-sozlesmesi",
      "iptal-iade-kosullari",
      "teslimat-kosullari",
      "duzenli-siparis-kosullari",
      "kvkk",
      "gizlilik-politikasi",
      "cerez-politikasi",
      "kullanim-sartlari",
    ],
    sections: [
      p(
        "Bu rehber, Apuhan Çiftliği üzerinden sipariş verirken ekranda gördüğünüz adımları ve sipariş sonrasında erişebileceğiniz bilgileri açıklar. Siparişe ilişkin özel koşullar için ilgili hukuki metinler esas alınır.",
      ),
      s(
        "Sipariş Oluşturma Adımları",
        "1. Ürünleri ana sayfada inceler, ürünün teslimata uygunluğunu ve güncel fiyatını görürsünüz. 2. Ürünü sepetinize eklersiniz. 3. Malatya içi teslimat veya kargo tercihini ürünlerinize ve teslimat adresinize uygun şekilde belirlersiniz. 4. Ödeme sayfasında müşteri, iletişim ve teslimat bilgilerinizi girer veya hesabınızla devam edersiniz.",
        "5. Sipariş özetinde ürünleri, miktarları, teslimat yöntemini, varsa teslimat günü/zaman aralığını, ödeme yöntemini ve toplam tutarı kontrol edersiniz. 6. Ön Bilgilendirme Formu ile Mesafeli Satış Sözleşmesi'ni açıp inceleyebilir; siparişi vermeden önce bu belgeleri okuduğunuzu ve koşulları kabul ettiğinizi onaylarsınız.",
        "7. Kullanılabilen ödeme seçenekleri siparişin teslimat kanalına göre gösterilir. Kartla ödeme seçildiğinde ödeme işlemi PayTR'nin güvenli ödeme sayfasında sürer. 8. Sipariş oluşturulduğunda sistem sipariş numarasını üretir. Kartla ödemede, ödeme sonucu PayTR akışında tamamlanır. 9. Başarılı işlemden sonra sipariş numaranızı görür; e-posta adresi verilmiş ve e-posta gönderimi yapılandırılmış siparişlerde onay e-postası da gönderilebilir.",
      ),
      s(
        "Veri Girişini Kontrol Etme ve Düzeltme",
        "Siparişi vermeden önce sepetinizdeki ürünleri ve miktarları, iletişim bilgilerinizi, teslimat adresinizi, teslimat gününü ve ödeme yönteminizi ödeme ekranında gözden geçirip düzeltebilirsiniz. Sipariş gönderildikten sonra sitede otomatik sipariş düzenleme ekranı bulunmaz; bir değişiklik veya iptal talebiniz varsa sipariş numaranızla destek kanallarından iletişime geçebilirsiniz.",
      ),
      sWithLinks(
        "Sözleşmelerin Elektronik Olarak Saklanması",
        [
          "Tek seferlik web siparişinde, Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi'nin kabulü zorunludur. Siparişle birlikte kabul edilen belgenin sürümü ve kabul zamanı elektronik olarak sipariş kaydına eklenir.",
          "Bu kayıt, geçmiş bir siparişte hangi belge sürümünün kabul edildiğini göstermek içindir. Güncel metinlere aşağıdaki bağlantılardan her zaman ulaşabilirsiniz.",
        ],
        [
          { href: "/on-bilgilendirme-formu", title: "Ön Bilgilendirme Formu" },
          { href: "/mesafeli-satis-sozlesmesi", title: "Mesafeli Satış Sözleşmesi" },
        ],
      ),
      sWithLinks(
        "Sipariş Sonrası Erişim",
        [
          "Hesapla verilen siparişler Hesabım sayfasından takip edilebilir. Misafir olarak verilen siparişler için Sipariş Sorgula sayfasında siparişte kullanılan telefon numarasıyla veya sipariş numarasıyla arama yapabilirsiniz.",
          "Düzenli Sipariş talebi oluşturduysanız, hesabınızdaki Düzenli Siparişlerim alanında talebin durumunu, aktifse sıradaki tarihi ve iptal seçeneğini görürsünüz.",
        ],
        [
          { href: "/hesap", title: "Hesabım" },
          { href: "/siparis-sorgula", title: "Sipariş Sorgula" },
          { href: "/duzenli-siparis", title: "Düzenli Sipariş" },
        ],
      ),
      sWithLinks(
        "Gizlilik ve Kişisel Veriler",
        [
          "Kişisel verilerinizin hangi amaçlarla işlendiği, kimlere aktarılabileceği ve KVKK kapsamındaki haklarınız aşağıdaki metinlerde açıklanır. Bu rehber, bu politikaların yerine geçmez.",
        ],
        [
          { href: "/kvkk", title: "KVKK Aydınlatma Metni" },
          { href: "/gizlilik-politikasi", title: "Gizlilik Politikası" },
          { href: "/cerez-politikasi", title: "Çerez Politikası" },
        ],
      ),
      sWithLinks(
        "Uyuşmazlıklar",
        [
          "Siparişten doğan uyuşmazlıklara ilişkin başvuru ve yetkili merciler, Mesafeli Satış Sözleşmesi'nin Uyuşmazlıklar bölümünde açıklanır.",
        ],
        [{ href: "/mesafeli-satis-sozlesmesi", title: "Mesafeli Satış Sözleşmesi" }],
      ),
    ],
  },
  {
    slug: "kullanim-sartlari",
    title: "Kullanım Şartları",
    longTitle: "Kullanım Şartları",
    updated: SALES_LEGAL_UPDATED,
    relatedSlugs: [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "iptal-iade-kosullari",
      "teslimat-kosullari",
      "gizlilik-politikasi",
      "kvkk",
      "cerez-politikasi",
      "islem-rehberi",
    ],
    sections: [
      p(
        `${COMPANY.brand} internet sitesini ziyaret ederek veya site üzerinden sunulan ürün görüntüleme, hesap, sepet, sipariş, sipariş sorgulama ve diğer hizmetleri kullanarak bu Kullanım Şartları'nı kabul etmiş olursunuz. Belirli bir satın alma işlemine ilişkin özel şartlar; Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, İptal ve İade Koşulları ile Teslimat Koşulları'nda ayrıca düzenlenir ve bu sayfanın altındaki "İlgili hukuki metinler" bölümünden bu sayfalara ulaşabilirsiniz.`,
      ),
      s(
        "Kapsam",
        "Bu Kullanım Şartları; internet sitesinin görüntülenmesi, ürünlerin incelenmesi, müşteri hesabının kullanılması, sepet işlemleri, sipariş oluşturulması, sipariş sorgulama ve site üzerinden iletişim kurulması gibi genel kullanım süreçlerini düzenler. Bu metin, Mesafeli Satış Sözleşmesi'nin yerine geçmez.",
      ),
      sellerIdentitySection(),
      s(
        "Ürün Bilgileri ve Görseller",
        `${COMPANY.brand}, ürünlerle ilgili doğru ve güncel bilgi vermek için makul çaba gösterir; ürün adı, miktarı, fiyatı ve teslimat türü gibi bilgiler ürün sayfalarında yer alır. Ürünler doğal/tarımsal nitelikte olduğundan renk, boyut ve görünümde doğal farklılıklar olabilir ve ürün görselleri temsili niteliktedir. Sipariş için geçerli olan bilgiler, sipariş oluşturulurken ekranda gösterilen güncel bilgilerdir.`,
      ),
      s(
        "Fiyatlar ve Sipariş Koşulları",
        "Ürünlerin güncel satış fiyatı ve toplam sipariş tutarı, ödemeden önce sipariş özeti ekranında gösterilir. Geçerli minimum sipariş tutarı ve teslimat koşulları ürüne ve teslimat türüne göre değişebileceğinden, sipariş sırasında sitede gösterilen güncel bilgiler esas alınır.",
      ),
      s(
        "Sipariş Oluşturma",
        "Sipariş vermeden önce seçtiğiniz ürünleri, miktarları, teslimat bilgilerinizi, ödeme yönteminizi ve toplam tutarı kontrol etmeniz gerekir. Siparişiniz, sipariş özetini onaylayıp gönderdiğinizde oluşturulur ve kendine özgü bir sipariş numarası alır.",
      ),
      s(
        "Yerel Teslimat ve Kargo",
        "Ürünlerin teslimat şekli, ürünün niteliğine ve teslimat adresinize göre değişir: bazı ürünler yalnızca bölge içi teslimat kapsamında, bazıları ise Türkiye geneline kargo ile gönderilir. Teslimat gün ve süreleri ile kargoya ilişkin ayrıntılar Teslimat Koşulları'nda yer alır.",
      ),
      s(
        "Düzenli Sipariş",
        "Hesabınız üzerinden düzenli sipariş talebinde bulunabilirsiniz: seçtiğiniz ürünler ve teslimat sıklığına göre, talebiniz onaylandıktan sonra siparişleriniz seçtiğiniz tarihlerde sizin adınıza otomatik olarak oluşturulur. Düzenli siparişlerde karttan otomatik tahsilat yapılmaz; kullanılabilen ödeme yöntemleri kapıda nakit ödeme veya havale/EFT'dir. Aktif talebinizin sıradaki tarihini ve iptal seçeneğini hesabınızdaki Düzenli Siparişlerim alanında görebilirsiniz. Ayrıntılar için Düzenli Sipariş Koşulları'nı inceleyin.",
      ),
      s(
        "Ödeme",
        "Sipariş sırasında; kredi/banka kartı (PayTR güvenli ödeme altyapısı üzerinden), kapıda nakit ödeme (yalnızca bölge içi teslimatlarda) veya banka havalesi/EFT ile ödeme yapabilirsiniz. Kart bilgileriniz sitemizde saklanmaz.",
      ),
      s(
        "Müşteri Hesabı",
        "Hesap oluşturursanız, hesap bilgilerinizin doğruluğundan ve giriş bilgilerinizin gizliliğinden siz sorumlusunuz. Hesabınızda olağan dışı bir kullanım fark ederseniz bizimle iletişime geçmenizi rica ederiz.",
      ),
      s(
        "Sipariş Sorgulama",
        "Sipariş sorgulama özelliği yalnızca sipariş sahibinin kendi siparişine erişmesi için sunulur. Başkasına ait sipariş, telefon veya adres bilgilerine yetkisiz şekilde erişmeye çalışmak yasaktır.",
      ),
      s(
        "Kullanıcının Sorumlulukları",
        "Siteyi kullanırken yanıltıcı sipariş veya iletişim bilgisi vermemeyi, başkalarına ait kişisel bilgileri yetkisiz şekilde kullanmamayı, sahte sipariş oluşturmamayı, ödeme sistemlerini kötüye kullanmamayı ve sitenin güvenliğini veya çalışmasını bozacak faaliyetlerde bulunmamayı kabul edersiniz.",
      ),
      s(
        "Ürünlerin Teslim Alınması ve Saklanması",
        "Taze ve bozulabilir ürünlerin (yumurta, süt ürünleri vb.) tesliminden sonra uygun koşullarda saklanması sizin sorumluluğunuzdadır. Ürün ambalajında özel bir saklama bilgisi varsa buna uyulması önerilir.",
      ),
      s(
        "İptal, İade ve Cayma Hakkı",
        "Siparişlerin iptali, iadesi ve cayma hakkına ilişkin esaslar İptal ve İade Koşulları ile Mesafeli Satış Sözleşmesi'nde düzenlenmiştir; bu sayfanın altındaki \"İlgili hukuki metinler\" bölümünden ulaşabilirsiniz.",
      ),
      s(
        "Fikri Mülkiyet",
        `Aksi belirtilmedikçe sitede yer alan özgün metin, tasarım, görsel ve marka unsurları ${COMPANY.brand}'na aittir. Bu materyallerin kişisel kullanımın ötesinde ticari amaçla çoğaltılması veya kullanılması için izin alınması gerekir.`,
      ),
      s(
        "Üçüncü Taraf Hizmetler",
        "Site; ödeme, barındırma, e-posta ve harita hizmetleri için üçüncü taraf sağlayıcılardan yararlanır. Bu sağlayıcıların kendi kullanım şartları ve gizlilik uygulamaları geçerli olabilir. Ayrıntılar için Gizlilik Politikamıza bakabilirsiniz.",
      ),
      s(
        "Teknik Kullanılabilirlik",
        "Sitenin kesintisiz veya hatasız çalışacağı garanti edilmez; bakım, altyapı veya üçüncü taraf hizmet sorunları nedeniyle site geçici olarak kullanılamayabilir.",
      ),
      s(
        "Sorumluluğun Sınırı",
        "Uygulanabilir mevzuatın izin verdiği ölçüde, kontrolümüz dışındaki teknik veya üçüncü taraf kaynaklı sorunlardan doğan dolaylı zararlardan sorumlu tutulamayabiliriz. Bu hüküm, tüketici mevzuatından doğan haklarınızı ortadan kaldıracak şekilde yorumlanamaz.",
      ),
      s(
        "Uygulanacak Hukuk",
        "Uyuşmazlıklarda, Mesafeli Satış Sözleşmesi'nin Uyuşmazlıklar bölümünde belirtilen yetkili merciler geçerlidir.",
      ),
      s(
        "Gizlilik",
        "Kişisel verilerinizin nasıl işlendiği hakkında bilgi için Gizlilik Politikamızı ve KVKK Aydınlatma Metni'ni inceleyebilirsiniz.",
      ),
      s(
        "Değişiklikler",
        "Bu Kullanım Şartları, sitedeki hizmetlerin veya yasal gerekliliklerin değişmesi halinde güncellenebilir; güncel sürüm bu sayfada, üstte belirtilen tarihle birlikte yayımlanır.",
      ),
      s(
        "İletişim",
        `Bu Kullanım Şartları veya internet sitesiyle ilgili sorularınız için: ${COMPANY.tradeName}, ${COMPANY.address}. Telefon: ${COMPANY.phone}. E-posta: ${COMPANY.email}.`,
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
