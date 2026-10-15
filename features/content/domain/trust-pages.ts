import { trustContentSchema } from "./trust-page.schema";

// Source IDs correspond to the fact/image tables in docs/hakkimizda-kaynaklar.md.
// Editorial biography notes are deliberately distinct from published posts.
export const TRUST_CONTENT = trustContentSchema.parse({
  sources: [
    { id: "bio-family", kind: "editorial", claim: "Bir çiftçi ailesinden geliyor.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-grandmother", kind: "editorial", claim: "Babaannesi çiftlikte birlikte çalışmaya devam ediyor.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-father", kind: "editorial", claim: "Babası da kendisiyle çiftlikte çalışıyor.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-move", kind: "editorial", claim: "Tarım yapmak için Malatya’ya taşındı.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-first-chickens", kind: "editorial", claim: "Tarım işine başlamadan önce tavuğa dokunamıyordu.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-study", kind: "editorial", claim: "İstanbul Teknik Üniversitesi Çevre Mühendisliği son sınıf öğrencisi.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-education", kind: "editorial", claim: "Tarım işine başladığı için eğitim süresi uzadı.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-week", kind: "editorial", claim: "Haftanın üç günü okul için İstanbul’da, dört günü Malatya’da çalışıyor.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-field", kind: "editorial", claim: "Malatya’da tarlada çalışıyor.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "bio-delivery", kind: "editorial", claim: "Ürünlerin dağıtımını da kendisi yapıyor.", reference: "biyografi-notu-2026-10-15", date: "2026-10-15" },
    { id: "farm-hens", kind: "instagram", claim: "Çiftlikte tavuk yetiştiriliyor; paylaşımda kümesin içindeki tavuklar gösteriliyor.", reference: "https://www.instagram.com/mr.apuhan/reel/DIy266PI0R9/", date: "2025-04-23" },
    { id: "farm-perches", kind: "instagram", claim: "Kümesin içine tavuklar için tünekler yapıldı.", reference: "https://www.instagram.com/mr.apuhan/reel/DSDE4_TiOs4/", date: "2025-12-09" },
    { id: "farm-packing", kind: "instagram", claim: "Yumurtaların paketlendiği anlar paylaşılıyor.", reference: "https://www.instagram.com/mr.apuhan/reel/DO1PEIjiOYl/", date: "2025-09-20" },
    { id: "farm-apricots", kind: "instagram", claim: "Malatya’da gün kurusu kayısı hazırlanıyor; kayısıların çekirdekleri ayrılıyor.", reference: "https://www.instagram.com/mr.apuhan/reel/Da2FgS5unqZ/", date: "2026-07-16" },
    { id: "farm-molasses", kind: "instagram", claim: "Dut pekmezini babaannesi hazırlıyor.", reference: "https://www.instagram.com/mr.apuhan/reel/Db_IL6_hWEf/", date: "2026-08-13" },
    { id: "image-eggs", kind: "instagram", claim: "Paylaşımda bir elde üç kahverengi yumurta gösteriliyor.", reference: "https://www.instagram.com/mr.apuhan/reel/DJ108r2IluE/", date: "2025-05-19" },
    { id: "image-yard", kind: "instagram", claim: "Paylaşımda kümes kapısından açık alana çıkan tavuklar gösteriliyor.", reference: "https://www.instagram.com/mr.apuhan/reel/DeTtvQiuHIh/", date: "2026-10-10" },
    { id: "company-identity", kind: "company", claim: "İşletme sahibi, marka ve iletişim bilgileri COMPANY sabitinden alınır.", reference: "features/storefront/domain/legal.ts#COMPANY", date: null },
  ],
  pages: [
    {
      slug: "hakkimizda",
      title: "Hakkımızda",
      eyebrow: "Hikâyemiz",
      description: {
        text: "Çiftçi bir aileden gelen bir İTÜ öğrencisinin İstanbul ve Malatya arasında sürdürdüğü tarım hikâyesi.",
        sourceIds: ["bio-family", "bio-study", "bio-week", "bio-move"],
      },
      introduction: {
        text: "Bir çiftçi ailesinden geliyorum. Bugün babaannem ve babamla aynı çiftlikte çalışıyorum.",
        sourceIds: ["bio-family", "bio-grandmother", "bio-father"],
      },
      hero: {
        src: "/hakkimizda/yumurtalar.webp",
        alt: "Bir elde üç kahverengi yumurta, arka planda kümesin zemini",
        caption: "Yumurtalarımızdan bir yakın plan.",
        width: 1080, height: 1080,
        sourceIds: ["image-eggs"],
      },
      sections: [
        {
          id: "aile",
          heading: "Çiftçilik ailemizin işi",
          paragraphs: [
            { text: "Babaannem hâlâ bizimle çalışıyor. Babam da çiftlikte yanımda.", sourceIds: ["bio-grandmother", "bio-father"] },
            { text: "Babaannemin elinden çıkan dut pekmezi de bu aile emeğinin bir parçası.", sourceIds: ["farm-molasses", "bio-grandmother"] },
          ],
        },
        {
          id: "malatyaya-uzanan-yol",
          heading: "Malatya’ya uzanan yol",
          paragraphs: [
            { text: "Tarım yapmak için Malatya’ya taşındım. Başladığımda bir tavuğa bile dokunamıyordum.", sourceIds: ["bio-move", "bio-first-chickens"] },
            { text: "Bugün tarlada çalışıyor, ürünlerin dağıtımını da yapıyorum.", sourceIds: ["bio-field", "bio-delivery"] },
          ],
          image: {
            src: "/hakkimizda/ciftlik-avlusu.webp",
            alt: "Kümesin kırmızı kapısından çiftlik avlusuna çıkan kahverengi tavuklar",
            caption: "Çiftlik avlusundan bir an.",
            width: 720, height: 720,
            sourceIds: ["image-yard"],
          },
        },
        {
          id: "iki-sehir",
          heading: "İstanbul’da okul, Malatya’da tarım",
          paragraphs: [
            { text: "İstanbul Teknik Üniversitesi’nde Çevre Mühendisliği son sınıf öğrencisiyim. Tarım işine başlayınca eğitim sürem uzadı.", sourceIds: ["bio-study", "bio-education"] },
            { text: "Haftanın üç günü okul için İstanbul’da, dört günü Malatya’dayım. Okul ve çiftlik işlerini birlikte sürdürüyorum.", sourceIds: ["bio-week"] },
          ],
        },
      ],
      relatedLink: { href: "/ciftligimiz", label: "Çiftliğimizi görün" },
    },
    {
      slug: "ciftligimiz",
      title: "Çiftliğimiz",
      eyebrow: "Çiftlikten",
      description: {
        text: "Kümesimiz, tavuklarımız, yumurta paketleme ve Malatya’da kayısı hazırlığı. Çiftlikte yaptığımız işlerden gerçek görüntüler.",
        sourceIds: ["farm-hens", "farm-packing", "farm-apricots", "image-yard"],
      },
      introduction: {
        text: "Çiftlikteki işlerimizi, kümesimizden yumurta paketlemeye ve kayısı hazırlığına uzanan paylaşımlarımızla tanıyın.",
        sourceIds: ["farm-hens", "farm-packing", "farm-apricots"],
      },
      hero: {
        src: "/hakkimizda/kumes-tavuklar.webp",
        alt: "Kümesin içinde yemliklerin ve su hattının çevresindeki kahverengi tavuklar",
        caption: "Kümesimizin içinden bir görüntü.",
        width: 1080, height: 1080,
        sourceIds: ["farm-hens"],
      },
      sections: [
        {
          id: "kumes",
          heading: "Kümesimiz ve tavuklarımız",
          paragraphs: [
            { text: "Çiftliğimizde tavuk yetiştiriyoruz. Kümesin içine tavuklar için tünekler yaptık.", sourceIds: ["farm-hens", "farm-perches"] },
          ],
        },
        {
          id: "yumurtalar",
          heading: "Yumurtalarımız",
          paragraphs: [
            { text: "Yumurtalarımızı paketlediğimiz anları da paylaşıyoruz.", sourceIds: ["farm-packing"] },
          ],
          image: {
            src: "/hakkimizda/yumurtalar.webp",
            alt: "Bir elde üç kahverengi yumurta, arka planda kümesin zemini",
            caption: "Yumurtalarımızdan bir yakın plan.",
            width: 1080, height: 1080,
            sourceIds: ["image-eggs"],
          },
        },
        {
          id: "kayisi",
          heading: "Kayısı zamanı",
          paragraphs: [
            { text: "Malatya’da gün kurusu kayısı hazırlıyoruz. Bu hazırlıkta kayısıların çekirdeklerini ayırıyoruz.", sourceIds: ["farm-apricots"] },
          ],
          image: {
            src: "/hakkimizda/kayisi-hazirligi.webp",
            alt: "Bir kasanın içindeki kayısıların çekirdeklerinin elle ayrılması",
            caption: "Kayısı hazırlığından bir an.",
            width: 1080, height: 1080,
            sourceIds: ["farm-apricots"],
          },
        },
        {
          id: "pekmez",
          heading: "Babaannemin elinden",
          paragraphs: [
            { text: "Dut pekmezini babaannem hazırlıyor.", sourceIds: ["farm-molasses"] },
          ],
        },
      ],
      relatedLink: { href: "/hakkimizda", label: "Hikâyemizi okuyun" },
    },
  ],
});
