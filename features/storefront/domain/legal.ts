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

const p = (...paragraphs: string[]): LegalSection => ({ paragraphs });
const s = (heading: string, ...paragraphs: string[]): LegalSection => ({
  heading,
  paragraphs,
});

const UPDATED = "2026-07-28";
// Bumped only for docs whose content actually changed on this revision
// (gizlilik-politikasi expansion, cerez-politikasi cookie/localStorage
// correction, new kullanim-sartlari) — every other doc keeps UPDATED as-is.
const UPDATED_2 = "2026-08-18";

export const LEGAL_DOCS: readonly LegalDoc[] = [
  {
    slug: "mesafeli-satis-sozlesmesi",
    title: "Mesafeli Satış Sözleşmesi",
    longTitle: "Mesafeli Satış Sözleşmesi",
    updated: UPDATED,
    sections: [
      s(
        "1. Taraflar",
        `SATICI: ${COMPANY.tradeName}, Adres: ${COMPANY.address}, Telefon: ${COMPANY.phone}, E-posta: ${COMPANY.email}.`,
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
