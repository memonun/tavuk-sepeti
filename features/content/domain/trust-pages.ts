import { trustContentSchema } from "./trust-page.schema";

// Source IDs correspond to the fact/image tables in docs/hakkimizda-kaynaklar.md.
// The copy is Hamit Apuhan's own letter of 2026-10-15, kept in his words;
// only the apostrophes were set typographically.
const OWNER_TEXT = { kind: "owner", reference: "sahip-metni-2026-10-15", date: "2026-10-15" } as const;
const OWNER_PHOTO = { kind: "owner", reference: "sahip-fotograflari-2026-10-15", date: "2026-10-15" } as const;

export const TRUST_CONTENT = trustContentSchema.parse({
  sources: [
    { id: "owner-founding", ...OWNER_TEXT, claim: "Apuhan Çiftliği 14 Mart 2025’te Malatya’nın Akçadağ ilçesine bağlı Bahri Mahallesi’nde kuruldu." },
    { id: "owner-move", ...OWNER_TEXT, claim: "Hamit Apuhan İstanbul’daki şehir hayatını bırakıp köye taşındı." },
    { id: "owner-learning", ...OWNER_TEXT, claim: "Çiftçiliği sonradan öğrendi; ilk zamanlarda bir tavuğa dokunmaya korkuyordu." },
    { id: "owner-farm-life", ...OWNER_TEXT, claim: "Küçük bir aile çiftliği; işler mevsimlere ve hayvanların ihtiyaçlarına göre yürüyor." },
    { id: "owner-hens", ...OWNER_TEXT, claim: "Gezen tavuklardan günlük yumurta toplanıyor." },
    { id: "owner-cows", ...OWNER_TEXT, claim: "İneklerin sütünden peynir yapılıyor." },
    { id: "owner-orchard", ...OWNER_TEXT, claim: "Bahçede yetişen kayısı ve duttan kurutulmuş meyve ve pekmez hazırlanıyor." },
    { id: "owner-honesty", ...OWNER_TEXT, claim: "Başkasına gönül rahatlığıyla sunulamayacak bir ürün üretilip satılmıyor." },
    { id: "owner-music", ...OWNER_TEXT, claim: "Müzisyen ve piyanist olarak Türkiye’de ve yurt dışında yüzlerce konserde sahne aldı." },
    { id: "owner-study", ...OWNER_TEXT, claim: "İstanbul Teknik Üniversitesi’nde son sınıf öğrencisi." },
    { id: "owner-goal", ...OWNER_TEXT, claim: "Amaç, güvenilen ve samimiyetini koruyan bir aile işletmesi olmak." },
    { id: "owner-invitation", ...OWNER_TEXT, claim: "Bahri Mahallesi’ne yolu düşenleri çaya davet ediyor." },
    { id: "photo-hens-open", ...OWNER_PHOTO, claim: "Çiftlikte açık alanda dolaşan tavuklar." },
    { id: "photo-hens-cloudy", ...OWNER_PHOTO, claim: "Bulutlu bir günde çayırdaki tavuklar." },
    { id: "photo-cow", ...OWNER_PHOTO, claim: "Çiftliğin ineği." },
    { id: "photo-stand", ...OWNER_PHOTO, claim: "Çiftlik ürünlerinin kara tahtalı satış masası." },
    { id: "photo-portrait", ...OWNER_PHOTO, claim: "Hamit Apuhan ve çiftliğin köpeği." },
    { id: "farm-apricots", kind: "instagram", claim: "Malatya’da gün kurusu kayısı hazırlanıyor; kayısıların çekirdekleri ayrılıyor.", reference: "https://www.instagram.com/mr.apuhan/reel/Da2FgS5unqZ/", date: "2026-07-16" },
    { id: "farm-molasses", kind: "instagram", claim: "Dut pekmezini babaannesi hazırlıyor.", reference: "https://www.instagram.com/mr.apuhan/reel/Db_IL6_hWEf/", date: "2026-08-13" },
    { id: "company-identity", kind: "company", claim: "İşletme sahibi, marka ve iletişim bilgileri COMPANY sabitinden alınır.", reference: "features/storefront/domain/legal.ts#COMPANY", date: null },
  ],
  pages: [
    {
      slug: "hakkimizda",
      title: "Hakkımızda",
      heading: "Hakkımızda",
      description: {
        text: "Apuhan Çiftliği 14 Mart 2025’te Malatya Akçadağ’da kuruldu. Hamit Apuhan’ın şehirden köye uzanan hikâyesi ve çiftliğin ilkeleri.",
        sourceIds: ["owner-founding", "owner-move", "owner-honesty"],
      },
      lead: [
        {
          text: "Apuhan Çiftliği, 14 Mart 2025’te Malatya’nın Akçadağ ilçesine bağlı Bahri Mahallesi’nde kuruldu. Ben Hamit Apuhan, İstanbul’daki şehir hayatımı bırakıp köye taşınmamla birlikte bu hikâye başladı.",
          sourceIds: ["owner-founding", "owner-move"],
        },
        {
          text: "İşin ilginç tarafı, çiftçilik benim her zaman içinde olduğum, çocukluğumdan beri bildiğim bir meslek değildi. Hatta ilk zamanlarda bir tavuğa dokunmaya bile korkuyordum. Zamanla korkularımın yerini merak, merakımın yerini de tecrübe aldı. Tavukların arasında dolaşmaya, hayvanların ihtiyaçlarını anlamaya ve toprağın dilini öğrenmeye başladım.",
          sourceIds: ["owner-learning"],
        },
        {
          text: "Bugün dönüp baktığımda, Apuhan Çiftliği’nin yalnızca bir işletme olarak değil, benimle birlikte gelişen bir hikâye olduğunu görüyorum.",
          sourceIds: ["owner-learning"],
        },
      ],
      hero: {
        src: "/hakkimizda/hamit-ve-kopegi.webp",
        alt: "Hamit Apuhan, yanağını çiftliğin iri beyaz köpeğine yaslamış",
        width: 1200, height: 1600,
        sourceIds: ["photo-portrait"],
      },
      sections: [
        {
          id: "durustluk",
          heading: "Bizim için dürüstlük her şeyden önce gelir",
          paragraphs: [
            { text: "Apuhan Çiftliği’nde kendimize belirlediğimiz en önemli ilkelerden biri, başkasına gönül rahatlığıyla sunamayacağımız bir ürünü üretip satmamaktır.", sourceIds: ["owner-honesty"] },
            { text: "Kendi soframız için istediğimiz özeni, müşterilerimizin sofrası için de göstermeye çalışıyoruz.", sourceIds: ["owner-honesty"] },
          ],
        },
        {
          id: "piyanodan-ciftlige",
          heading: "Piyanodan çiftlik hayatına",
          paragraphs: [
            { text: "Çiftçilikten önce hayatımın önemli bir bölümünde müzik vardı. Müzisyenlik ve piyanistlik yaptım. Tanınmış sanatçılarla Türkiye’de ve yurt dışında yüzlerce konserde sahne aldım. Bugün ise İstanbul Teknik Üniversitesi’nde son sınıf öğrencisiyim.", sourceIds: ["owner-music", "owner-study"] },
            { text: "Piyano çalmakla tavuk yetiştirmek ilk bakışta birbirinden oldukça uzak işler gibi görünüyor. Aslında öyleler de. Ancak ikisinin bana öğrettiği ortak bir şey var: Emek vermeden ve sabırlı olmadan güzel sonuçlar elde etmek kolay değil.", sourceIds: ["owner-music"] },
            { text: "Müzik hayatımın bana kazandırdığı disiplini, üniversite eğitimimden edindiğim bakış açısını ve çiftlikte kazandığım tecrübeleri bugün bir araya getirmeye çalışıyorum.", sourceIds: ["owner-music", "owner-study"] },
          ],
        },
        {
          id: "gelecek",
          heading: "Geleneklerimizi korurken geleceğe bakıyoruz",
          paragraphs: [
            { text: "Amacımız yalnızca daha fazla ürün satmak değil. İnsanların güvenerek alışveriş yapabildiği, ürünlerinin arkasında duran ve yıllar geçse de samimiyetini kaybetmeyen bir aile işletmesi oluşturmak.", sourceIds: ["owner-goal"] },
            { text: "Bu hikâyenin henüz başındayız. Önümüzde öğrenecek çok şey, yapacak çok iş var.", sourceIds: ["owner-goal"] },
          ],
          image: {
            src: "/hakkimizda/tezgah-kara-tahta.webp",
            alt: "Keten örtülü masada “Apuhan Çiftliği” yazan kara tahta, kutuda kuru kayısı, sepetlerde badem ve dut kurusu",
            width: 1200, height: 1600,
            sourceIds: ["photo-stand"],
          },
        },
      ],
      closing: {
        paragraphs: [
          { text: "Bir gün yolunuz Malatya’nın Akçadağ ilçesine, Bahri Mahallesi’ne düşerse bir çayımızı içmeye bekleriz.", sourceIds: ["owner-invitation"] },
        ],
        signOff: "Sevgi ve saygılarımla,",
      },
      relatedLink: { href: "/ciftligimiz", label: "Çiftliğimizi görün" },
    },
    {
      slug: "ciftligimiz",
      title: "Çiftliğimiz",
      heading: "Küçük bir aile çiftliği, büyük bir emek",
      description: {
        text: "Gezen tavuklarımız, ineklerimiz, kayısı ve dut bahçemiz. Apuhan Çiftliği’nde yumurtanın, peynirin, kuru meyvenin ve pekmezin nereden geldiğini görün.",
        sourceIds: ["owner-hens", "owner-cows", "owner-orchard"],
      },
      lead: [
        { text: "Apuhan Çiftliği’nde hayat, mevsimlere ve hayvanlarımızın ihtiyaçlarına göre şekilleniyor.", sourceIds: ["owner-farm-life"] },
      ],
      hero: {
        src: "/hakkimizda/tavuklar-acik-alan.webp",
        alt: "Meyve ağaçlarıyla çevrili çayırda dolaşan yüzlerce kahverengi tavuk, arkada dağlar ve bulutlu gökyüzü",
        width: 1600, height: 1200,
        sourceIds: ["photo-hens-open"],
      },
      sections: [
        {
          id: "tavuklar",
          heading: "Gezen tavuklarımız",
          paragraphs: [
            { text: "Gezen tavuklarımızdan günlük yumurtalarımızı topluyoruz.", sourceIds: ["owner-hens"] },
          ],
          image: {
            src: "/hakkimizda/tavuklar-bulutlu-gun.webp",
            alt: "Bulutlu bir günde meyve ağaçlarının altındaki çayırda eşinen kahverengi tavuklar",
            width: 1600, height: 1200,
            sourceIds: ["photo-hens-cloudy"],
          },
        },
        {
          id: "inekler",
          heading: "İneklerimiz",
          paragraphs: [
            { text: "İneklerimizin sütünden peynir yapıyoruz.", sourceIds: ["owner-cows"] },
          ],
          image: {
            src: "/hakkimizda/inek.webp",
            alt: "Ağaçların altında, çayırda yularlı kızıl beyaz bir inek",
            width: 923, height: 1231,
            sourceIds: ["photo-cow"],
          },
        },
        {
          id: "kayisi-ve-dut",
          heading: "Kayısı ve dut",
          paragraphs: [
            { text: "Bahçemizde yetişen kayısı ve dutları değerlendiriyor; kurutulmuş meyveler ve pekmez gibi geleneksel ürünler hazırlıyoruz.", sourceIds: ["owner-orchard"] },
            { text: "Dut pekmezini babaannem hazırlıyor.", sourceIds: ["farm-molasses"] },
          ],
          image: {
            src: "/hakkimizda/kayisi-hazirligi.webp",
            alt: "Bir kasanın içindeki kayısıların çekirdeklerinin elle ayrılması",
            width: 1080, height: 1080,
            sourceIds: ["farm-apricots"],
          },
        },
      ],
      closing: {
        paragraphs: [
          { text: "Bütün bunları büyük bir fabrikanın üretim anlayışıyla değil, bir aile çiftliğinin imkânları ve emeğiyle gerçekleştiriyoruz.", sourceIds: ["owner-farm-life"] },
        ],
        image: {
          src: "/hakkimizda/tezgah.webp",
          alt: "Ağaçların önünde keten örtülü bir masa: “Apuhan Çiftliği” yazan kara tahta, kutularda kuru kayısı, sepetlerde badem ve dut kurusu",
          width: 1600, height: 1200,
          sourceIds: ["photo-stand"],
        },
      },
      relatedLink: { href: "/hakkimizda", label: "Hikâyemizi okuyun" },
    },
  ],
});
