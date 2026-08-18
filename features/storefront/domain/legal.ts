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
// Vergi/TC no bilinçli olarak herkese açık GÖSTERİLMEZ (KVKK/gizlilik). Footer ve
// sözleşmede yalnızca ünvan + adres + telefon + e-posta gösterilir.
export const COMPANY: Company = {
  tradeName: "Hamit Apuhan",
  brand: "Apuhan Çiftliği",
  address: "Bahri Mah. Mezarlık Cad. No: 17, Akçadağ / Malatya",
  phone: "+90 533 255 64 44",
  email: "hamitapuhanlive@gmail.com",
  taxOffice: "Akçadağ", // kayıt için tutulur, sitede gösterilmez
  taxNo: "", // TC/VKN repo'da saklanmaz, sitede gösterilmez
  mersisNo: "",
  kepAddress: "",
  // Apex (www YOK) ve punycode değil: PayTR'nin panelde kilitli "SİTE ADRESİNİZ"
  // alanı tam olarak bu — NEXT_PUBLIC_APP_URL ile birebir aynı kalmalı, yoksa
  // ödeme sayfası "API bilgileri sadece ... için tanımlıdır" diye reddediyor.
  siteUrl: "https://apuhanciftligi.com",
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
  { slug: "on-bilgilendirme-formu", version: "2026-08-18" },
  { slug: "mesafeli-satis-sozlesmesi", version: "2026-08-18" },
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

const SALES_LEGAL_UPDATED = "2026-08-18";
// Protected by this task: these were set in PR #114 and remain untouched.
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
    ],
    sections: [
      s(
        "1. Taraflar",
        `SATICI: ${COMPANY.tradeName}, Adres: ${COMPANY.address}, Telefon: ${COMPANY.phone}, E-posta: ${COMPANY.email}.`,
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
        "ALICI, kanuni istisnalar saklı kalmak üzere malın tesliminden itibaren on dört gün içinde gerekçe göstermeden cayma hakkını kullanabilir. Çabuk bozulabilen veya son kullanma tarihi geçebilecek mallar ile teslimden sonra koruyucu ambalajı açıldığında sağlık ve hijyen açısından iadesi uygun olmayan mallar bakımından ilgili mevzuatta öngörülen istisnalar uygulanabilir. Bir ürünün yalnızca gıda olması, tek başına cayma hakkının bulunmadığı anlamına gelmez.",
      ),
      s(
        "8. Ayıplı, Hasarlı veya Yanlış Ürün",
        "Cayma hakkına ilişkin istisnalar, ALICI'nın ayıplı mal hükümlerinden doğan yasal haklarını ortadan kaldırmaz. Yanlış, eksik, bozuk veya taşıma sırasında hasar görmüş bir ürün teslim alınırsa ALICI, SATICI'nın mevcut iletişim kanallarından durumu bildirebilir.",
      ),
      s(
        "9. İptal ve Geri Ödeme",
        "Hazırlanmamış, teslimata çıkmamış veya kargoya verilmemiş siparişler için iletilen iptal talebi operasyonel duruma göre değerlendirilir. Cayma veya uygun bir iptal halinde geri ödeme, uygulanabilir mevzuata uygun biçimde ve kullanılan ödeme aracına uygun olarak yapılır. Ayrıntılar İptal ve İade Koşulları'nda yer alır.",
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
    ],
    sections: [
      s(
        "Satıcı Bilgileri",
        `Ünvan: ${COMPANY.tradeName}. Adres: ${COMPANY.address}. Telefon: ${COMPANY.phone}. E-posta: ${COMPANY.email}.`,
      ),
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
        "Kanuni istisnalar saklı kalmak üzere malın tesliminden itibaren on dört gün içinde cayma hakkınızı kullanabilirsiniz. Çabuk bozulabilen veya son kullanma tarihi geçebilecek mallar ile koruyucu ambalajı açılmış ve sağlık/hijyen yönünden iadesi uygun olmayan mallar, ilgili mevzuatta yer alan istisnalara girebilir. Her gıda ürünü kendiliğinden cayma hakkı dışında sayılmaz.",
      ),
      s(
        "İade ve Şikâyet",
        `Cayma bildiriminizi yazılı olarak veya kalıcı veri saklayıcısı yoluyla ${COMPANY.email} adresine iletebilirsiniz. Telefon, destek ve bilgi alma kanalı olarak kullanılabilir. Yanlış, eksik, hasarlı veya ayıplı ürünlere ilişkin yasal haklarınız saklıdır. Talep ve şikâyetlerinizi mevcut iletişim kanallarından iletebilirsiniz.`,
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
    updated: UPDATED_2,
    relatedSlugs: ["kvkk", "cerez-politikasi", "mesafeli-satis-sozlesmesi", "kullanim-sartlari"],
    sections: [
      p(
        `${COMPANY.brand} olarak; sitemizi ziyaret ettiğinizde, müşteri hesabı oluşturduğunuzda, sipariş verdiğinizde, siparişinizi sorguladığınızda veya bizimle iletişime geçtiğinizde işlenen kişisel verilerinizin gizliliğine önem veriyoruz. Bu Gizlilik Politikası, hangi kişisel verilerin hangi amaçlarla işlendiğini, kimlerle paylaşılabileceğini ve KVKK kapsamındaki haklarınızı açıklamak amacıyla hazırlanmıştır.`,
      ),
      s(
        "Veri Sorumlusu",
        `Kişisel verilerinizin işlenmesinden ${COMPANY.brand} (${COMPANY.tradeName}) sorumludur. Adres: ${COMPANY.address}. Telefon: ${COMPANY.phone}. E-posta: ${COMPANY.email}.`,
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
        "Hizmetin yürütülmesi için şu sağlayıcılardan yararlanılmaktadır: Supabase (hesap/kimlik doğrulama ve sipariş veritabanı altyapısı), PayTR (kredi/banka kartı ile ödeme işlemleri), Resend (sipariş onay e-postalarının gönderimi), Google Haritalar (teslimat adresinin haritada gösterimi ve konum belirleme) ve Vercel (sitenin barındırılması). Bu sağlayıcılar yalnızca hizmetin gerektirdiği ölçüde ve kendi gizlilik/güvenlik uygulamaları çerçevesinde veri işler.",
      ),
      s(
        "WhatsApp Üzerinden İletişim",
        "Sitedeki WhatsApp bağlantısı, sizi WhatsApp uygulamasına yönlendiren basit bir bağlantıdır; buradan başlattığınız görüşmeler WhatsApp'ın kendi hizmet şartlarına tabidir.",
      ),
      s(
        "Kişisel Verilerin Aktarılması",
        "Kişisel verileriniz, hizmetin yürütülmesi için gerekli olduğu ölçüde ödeme hizmet sağlayıcımıza, teknik altyapı sağlayıcılarımıza ve hukuken yetkili kamu kurumlarına aktarılabilir. Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz veya kiralanmaz.",
      ),
      s(
        "Yurt Dışına Veri Aktarımı",
        "Kullandığımız bazı hizmet sağlayıcılar (barındırma, ödeme, e-posta, harita gibi) verileri yurt dışındaki sunucularında işleyebilir. Bu aktarımlar, hizmetin gerektirdiği ölçüde ve ilgili sağlayıcının kendi güvenlik uygulamaları çerçevesinde gerçekleşir.",
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
    ],
    sections: [
      s(
        "Veri Sorumlusu",
        `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu ${COMPANY.brand} (${COMPANY.tradeName})'dir. Adres: ${COMPANY.address}. Telefon: ${COMPANY.phone}. E-posta: ${COMPANY.email}.`,
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
        "Veriler, hizmetin yürütülmesi için gerekli ölçüde ödeme hizmet sağlayıcısı PayTR'ye, hesap/kimlik doğrulama ve veritabanı altyapısı sağlayıcısı Supabase'e, e-posta gönderimi için Resend'e, adres/konum işlemleri için Google Haritalar'a, barındırma hizmeti için Vercel'e; ayrıca mevzuatın gerektirdiği hallerde yetkili kamu kurum ve kuruluşlarına aktarılabilir. Bu sağlayıcılar yalnızca kendi hizmetlerinin gerektirdiği veri kategorilerine erişir.",
      ),
      s(
        "Yurt Dışına Aktarım",
        "Kullanılan teknik hizmet sağlayıcıların altyapıları nedeniyle kişisel verilerin yurt dışında işlenmesi veya aktarılması gündeme gelebilir. Her somut aktarım için uygulanacak KVKK mekanizması ve ek yükümlülükler veri sorumlusu tarafından ayrıca değerlendirilir; bu metin belirli bir aktarım mekanizması beyanı değildir.",
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
      s(
        "Sipariş İptali",
        "Sitede otomatik sipariş iptal ekranı bulunmaz. Henüz hazırlanmamış, teslimata çıkmamış veya kargoya verilmemiş bir sipariş için mevcut iletişim kanallarından iptal talebi iletebilirsiniz; talep siparişin operasyonel durumuna göre değerlendirilir.",
      ),
      s(
        "Cayma Hakkı ve İstisnası",
        "Kanuni istisnalar saklı kalmak üzere teslimden itibaren on dört gün içinde cayma hakkınızı kullanabilirsiniz. Çabuk bozulabilen veya son kullanma tarihi geçebilecek mallar ile koruyucu ambalajı açılmış ve sağlık/hijyen yönünden iadesi uygun olmayan mallar bakımından mevzuattaki istisnalar uygulanabilir. Tüm gıda ürünleri tek başına bu nedenle cayma hakkı dışında değildir.",
      ),
      s(
        "Cayma Bildirimi ve İade Süreci",
        `Cayma bildiriminizi yazılı olarak veya kalıcı veri saklayıcısı yoluyla ${COMPANY.email} adresine iletebilirsiniz. Telefon, destek ve bilgi alma kanalı olarak kullanılabilir. İade yöntemi, ürünün niteliği ve iade talebinin kapsamına göre müşteriyle koordine edilir.`,
      ),
      s(
        "Yanlış, Eksik, Hasarlı veya Ayıplı Ürün",
        `Yanlış, eksik, taşıma sırasında hasar görmüş veya bozuk/ayıplı olduğunu düşündüğünüz ürün için ${COMPANY.email} ya da ${COMPANY.phone} üzerinden bizimle iletişime geçebilirsiniz. Cayma hakkı istisnası, ayıplı maldan doğan yasal haklarınızı sınırlamaz.`,
      ),
      s(
        "Geri Ödeme",
        "Uygun geri ödemeler, uygulanabilir mevzuata uygun biçimde ve kullanılan ödeme aracına uygun olarak yapılır. İade sürecinin somut yöntemi, siparişin ödeme biçimi ve talebin kapsamına göre müşteriyle koordine edilir.",
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
    ],
    sections: [
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
    ],
    sections: [
      s(
        "Nasıl Çalışır",
        "Düzenli sipariş özelliği, hesabınızdan seçtiğiniz ürünler ve haftalık veya iki haftada bir teslimat sıklığı için bir talep oluşturmanızı sağlar. Talep önce ekip tarafından değerlendirilir; onaylanmadıkça düzenli sipariş oluşturulmaz.",
      ),
      s(
        "Oluşturulan Siparişler ve Fiyatlar",
        "Onaylanan talep için sistem, seçtiğiniz periyotlarda yeni siparişler oluşturur. Her sipariş, oluşturulduğu tarihteki güncel katalog ve fiyat bilgileriyle hesaplanır; talebin oluşturulduğu tarihteki fiyatların gelecekte sabit kalacağı taahhüt edilmez. Ürün uygunluğu değişirse sipariş oluşturulamayabilir.",
      ),
      s(
        "Ödeme ve Teslimat",
        "Düzenli siparişlerde karttan otomatik tahsilat yapılmaz. Kullanılabilen ödeme yöntemleri, siparişin teslimat kanalına göre kapıda nakit ödeme veya havale/EFT'dir. Talepte seçilen teslimat günü, düzenli sipariş formunda müşteriye sunulan günlerden seçilir.",
      ),
      s(
        "Durdurma ve İptal",
        "Hesabınızdaki Düzenli Siparişlerim alanından talebinizi iptal edebilirsiniz. İptal edildiğinde talep pasifleştirilir; henüz sonuçlanmamış olarak oluşturulmuş düzenli siparişler de iptal edilir. Siparişiniz oluşturulduktan sonraki tüketici haklarınız, ilgili siparişe ait Mesafeli Satış Sözleşmesi ve İptal ve İade Koşulları çerçevesinde saklıdır.",
      ),
    ],
  },
  {
    slug: "kullanim-sartlari",
    title: "Kullanım Şartları",
    longTitle: "Kullanım Şartları",
    updated: UPDATED_2,
    relatedSlugs: [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "iptal-iade-kosullari",
      "teslimat-kosullari",
      "gizlilik-politikasi",
      "kvkk",
      "cerez-politikasi",
    ],
    sections: [
      p(
        `${COMPANY.brand} internet sitesini ziyaret ederek veya site üzerinden sunulan ürün görüntüleme, hesap, sepet, sipariş, sipariş sorgulama ve diğer hizmetleri kullanarak bu Kullanım Şartları'nı kabul etmiş olursunuz. Belirli bir satın alma işlemine ilişkin özel şartlar; Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, İptal ve İade Koşulları ile Teslimat Koşulları'nda ayrıca düzenlenir ve bu sayfanın altındaki "İlgili hukuki metinler" bölümünden bu sayfalara ulaşabilirsiniz.`,
      ),
      s(
        "Kapsam",
        "Bu Kullanım Şartları; internet sitesinin görüntülenmesi, ürünlerin incelenmesi, müşteri hesabının kullanılması, sepet işlemleri, sipariş oluşturulması, sipariş sorgulama ve site üzerinden iletişim kurulması gibi genel kullanım süreçlerini düzenler. Bu metin, Mesafeli Satış Sözleşmesi'nin yerine geçmez.",
      ),
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
        "Hesabınız üzerinden düzenli sipariş talebinde bulunabilirsiniz: seçtiğiniz ürünler ve teslimat sıklığına göre, talebiniz onaylandıktan sonra siparişleriniz seçtiğiniz tarihlerde sizin adınıza otomatik olarak oluşturulur. Bu bir otomatik kart tahsilatı (abonelik) değildir — düzenli siparişler yalnızca kapıda nakit ödeme veya havale/EFT ile ödenir. Oluşturulan her siparişi hesabınızdan takip edebilirsiniz.",
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
        "Uyuşmazlıklarda, Mesafeli Satış Sözleşmesi'nin 6. maddesinde belirtilen yetkili merciler geçerlidir.",
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
