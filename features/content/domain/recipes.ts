import { recipeCollectionSchema } from "./recipe.schema";
import type { Recipe } from "./recipe";

// TODO: Her tarif için bitmiş yemeğin özgün fotoğrafını public/tarifler/'e
// ekle; image ve imageAlt alanlarını güncelle. Şimdilik marka görseli kullanılır.
export const RECIPES: readonly Recipe[] = recipeCollectionSchema.parse([
  {
    slug: "koy-yumurtali-menemen",
    title: "Köy yumurtalı menemen",
    description:
      "Köy yumurtası, olgun domates ve yeşil biberle kahvaltılık menemen. Domatesin suyunu dengede tutan, iki kişilik kolay bir tava tarifi.",
    publishedAt: "2026-10-15",
    image: "/tarifler/tarif-placeholder.png",
    imageAlt:
      "Apuhan Çiftliği marka görseli; menemen fotoğrafı yakında eklenecek",
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 2,
    ingredients: [
      "3 köy yumurtası",
      "3 orta boy olgun domates",
      "2 yeşil biber",
      "1 yemek kaşığı zeytinyağı",
      "Yarım çay kaşığı tuz",
      "İsteğe göre bir tutam karabiber",
    ],
    steps: [
      "Domatesleri rendeleyin. Biberlerin saplarını ve çekirdeklerini çıkarıp ince halkalar halinde doğrayın. Yumurtaları ayrı bir kaseye kırıp çatalla hafifçe karıştırın.",
      "Zeytinyağını orta ateşte bir tavada ısıtın. Biberleri ekleyip renkleri dönene ve hafifçe yumuşayana kadar yaklaşık 4 dakika çevirin.",
      "Domatesleri ve tuzu ekleyin. Kapağı açık olarak 7 dakika kadar pişirin; kaşıkla yol açtığınızda tava tabanı kısa süre görünüyorsa fazla su uçmuş demektir. Domates çok susuzsa bir yemek kaşığı su ekleyin.",
      "Ateşi kısın ve yumurtaları domatesin üzerine gezdirin. Spatulayla kenarlardan ortaya doğru birkaç kez karıştırarak yaklaşık 4 dakika, yumurta tamamen pişene kadar ocakta tutun.",
      "Karabiberi ekleyip tavayı ocaktan alın. Menemeni bekletmeden, yanında ekmekle servis edin; tavada uzun süre kalırsa yumurta kuruyabilir.",
    ],
    productSlugs: ["yumurta"],
  },
  {
    slug: "firinda-yumurtali-patates",
    title: "Fırında yumurtalı patates",
    description:
      "Önce kızaran patatesler, ardından köy yumurtası: kahvaltı ya da hafif akşam yemeği için dört kişilik fırında yumurtalı patates tarifi.",
    publishedAt: "2026-10-15",
    image: "/tarifler/tarif-placeholder.png",
    imageAlt:
      "Apuhan Çiftliği marka görseli; yumurtalı patates fotoğrafı yakında eklenecek",
    prepMinutes: 15,
    cookMinutes: 40,
    servings: 4,
    ingredients: [
      "4 köy yumurtası",
      "4 orta boy patates (yaklaşık 700 gram)",
      "2 yemek kaşığı zeytinyağı",
      "1 çay kaşığı tatlı toz biber",
      "Yarım çay kaşığı kekik",
      "Yarım çay kaşığı tuz",
      "Servis için 2 dal maydanoz",
    ],
    steps: [
      "Fırını alt-üst ayarda 200 °C'ye ısıtın. Patatesleri soyup yaklaşık 2 santimetrelik küpler halinde doğrayın. Yıkadıktan sonra temiz bir bezle iyice kurulayın; ıslak patates zor kızarır.",
      "Patatesleri zeytinyağı, toz biber, kekik ve tuzla karıştırın. Orta boy bir fırın kabına, mümkün olduğunca tek kat olacak şekilde yayın.",
      "Kabı orta rafa koyup patatesleri yaklaşık 30 dakika pişirin. Sürenin yarısında bir kez çevirin. Bir parçaya çatal rahatça giriyorsa yumurtaları eklemeye hazırdır; sertse birkaç dakika daha pişirin.",
      "Kabı dikkatlice çıkarın. Patateslerin arasında kaşıkla dört küçük yuva açın. Yumurtaları tek tek bir kaseye kırıp her yuvaya bir yumurta bırakın.",
      "Kabı yeniden fırına verip yaklaşık 10 dakika, yumurta akı ve sarısı tamamen pişene kadar tutun. Fırınların pişirme hızı değiştiği için son dakikalarda kontrol edin.",
      "İnce kıyılmış maydanozu üzerine serpin. Kabı birkaç dakika dinlendirip her porsiyona bir yumurta gelecek şekilde servis edin.",
    ],
    productSlugs: ["yumurta"],
  },
  {
    slug: "ev-yapimi-yogurt",
    title: "Ev yapımı yoğurt",
    description:
      "Taze sütle evde yoğurt nasıl mayalanır? Sütü ısıtma, mayalama ve dinlendirme adımlarını anlatan, bir litre sütle hazırlanan sade yoğurt tarifi.",
    publishedAt: "2026-10-15",
    image: "/tarifler/tarif-placeholder.png",
    imageAlt:
      "Apuhan Çiftliği marka görseli; ev yapımı yoğurt fotoğrafı yakında eklenecek",
    prepMinutes: 30,
    cookMinutes: 20,
    servings: 6,
    ingredients: [
      "1 litre taze süt (tercihen pastörize)",
      "1 yemek kaşığı sade, canlı kültürlü yoğurt",
    ],
    steps: [
      "Tencereyi, kaşığı ve mayalama kabını iyice temizleyin. Sütü tencereye alın. Taze çiğ süt kullanıyorsanız çiğ olarak mayalamayın; önce karıştırarak kaynatın, taşırmamaya dikkat edin.",
      "Pastörize sütü yaklaşık 85–90 °C'ye kadar ısıtın. Kaynattığınız çiğ sütü de bu aralığa düşürün. Her iki durumda da sütü kısık ateşte, ara sıra karıştırarak yaklaşık 20 dakika bu sıcaklıkta tutun.",
      "Tencereyi ocaktan alın ve sütü 43–45 °C'ye kadar soğutun. Isıyı mutfak termometresiyle ölçün; çok sıcak süt mayadaki kültürleri etkisiz bırakabilir. Soğuma, ortam sıcaklığına göre yaklaşık 30 dakika sürebilir.",
      "Mayalık yoğurdu küçük bir kasede birkaç kaşık ılık sütle pürüzsüz hale getirin. Karışımı kalan süte ekleyip nazikçe karıştırın ve temiz mayalama kabına aktarın.",
      "Kabın kapağını kapatın. Yoğurt makinesinde ya da sıcaklığı kontrol edilebilen bir ortamda yaklaşık 43 °C'de 4–6 saat, kıvam alana kadar mayalayın. Bu sırada kabı sarsmayın. Bu bekleme süresi, yukarıdaki hazırlık ve pişirme sürelerine dahil değildir.",
      "Yoğurt kıvam aldığında bekletmeden buzdolabına alın. En az 6 saat soğutup dinlendirdikten sonra servis edin; bu dinlenme süresi de aktif hazırlığa dahil değildir. Üzerinde biriken az miktarda suyu karıştırabilir veya süzebilirsiniz.",
    ],
    productSlugs: ["sut"],
  },
] satisfies Recipe[]);
