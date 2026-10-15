-- Altı mağaza ürününün boş kısa/uzun açıklamalarını doldurur.
-- Metinlerin kaynakları ve editöryel sınırları: docs/urun-aciklamalari.md.
-- Şema, fiyat, miktar ve teslimat ayarları değişmez. Her alan ayrı korunur:
-- PR hazırlanırken veya sonrasında panelden girilmiş bir metnin üzerine yazılmaz.
-- Ürün bulunmazsa oluşturulmaz; eşleşme değiştirilebilir slug değil, kalıcı key ile.

with descriptions (key, short_description, long_description) as (
  values
    (
      'eggs',
      $short$Babam ve babaannemle çalıştığımız çiftliğin yumurtaları. Kahvaltıda, menemende ya da evde yaptığınız bir kekte sofranıza eşlik etsin.$short$,
      $long$Tarıma başladığımda bir tavuğa bile dokunamıyordum. Şimdi babam ve babaannemle birlikte çalıştığımız çiftlikte, kümesimizle ve yumurtalarımızın paketlenmesiyle ilgileniyorum.

Kahvaltıda sahanda pişirebilir, menemene kırabilir ya da evde yaptığınız kek ve böreklerde kullanabilirsiniz. Çiftlikteki işlerimizin sofranıza ulaşan parçalarından biri de bu yumurtalar.$long$
    ),
    (
      'gun-kurusu-kayisi',
      $short$Malatya’da hazırladığımız gün kurusu kayısı. Çayın yanına koyabilir, yoğurda doğrayabilir ya da sade yiyebilirsiniz.$short$,
      $long$Gün kurusu kayısılarımızı Malatya’da hazırlıyoruz. Kayısıların çekirdeklerini tek tek ayırıyoruz; sofranıza gelmeden önceki hazırlığın bir kısmı böyle geçiyor.

Çay demlendiğinde yanına birkaç kayısı koyabilir, kahvaltıda yoğurdunuza doğrayabilirsiniz. Mutfakta kullanmak isterseniz kompostoya ya da evde yaptığınız bir keke de ekleyebilirsiniz.$long$
    ),
    (
      'sari-kuru-kayisi',
      $short$Çayın yanına çıkarabileceğiniz sarı kuru kayısı. Kompostoda, kekte ya da sade olarak değerlendirebilirsiniz.$short$,
      $long$Çay demlenirken küçük bir tabağa sarı kuru kayısı koyup sofraya çıkarabilirsiniz. Gün içinde canınız tatlı bir şey çektiğinde de sade olarak yiyebilirsiniz.

Mutfakta değerlendirmek isterseniz küçük küçük doğrayıp kekinize ekleyebilir ya da komposto hazırlayabilirsiniz. Cevizle birlikte bir tabağa koymak da çayın yanına kolay bir hazırlık.$long$
    ),
    (
      'gun-kurusu-kayisi-cekirdegi',
      $short$Kayısı ürünlerimiz arasında ayrı olarak sunduğumuz gün kurusu kayısı çekirdeği.$short$,
      $long$Kayısının meyvesinin yanında çekirdeğine de mağazamızda yer veriyoruz. Gün kurusu kayısı çekirdeğini, kuru kayısıdan ayrı bir ürün olarak sipariş edebilirsiniz.$long$
    ),
    (
      'dut-pekmezi',
      $short$Babaannemin hazırladığı dut pekmezi. Kahvaltıda tahinle karıştırabilir ya da ekmeğin üzerine gezdirebilirsiniz.$short$,
      $long$Bizde dut pekmezinin başında babaannem var. Çiftlikte hâlâ birlikte çalışıyoruz; pekmezi de o hazırlıyor. Bu kavanozda onun emeği var.

Kahvaltıda tahinle karıştırabilir, ekmeğin üzerine gezdirebilirsiniz. Yoğurda eklemek de sofrada değerlendirebileceğiniz seçeneklerden.$long$
    ),
    (
      'dut-kurusu',
      $short$Çayın yanında sade, kahvaltıda yoğurtla. Dut kurusunu ceviz veya fındıkla birlikte de sofraya çıkarabilirsiniz.$short$,
      $long$Dut kurusunu çayın yanına küçük bir tabakta çıkarabilir, sade yiyebilir ya da ceviz ve fındıkla bir araya getirebilirsiniz. Uzun hazırlık istemeyen bir eşlikçi.

Kahvaltıda yoğurdun veya yulafın üzerine de koyabilirsiniz. Evde kek ya da kurabiye yaparken kullanmak isterseniz küçük parçalara ayırıp karışıma ekleyebilirsiniz.$long$
    )
)
update public.products as product
set
  web_description = case
    when nullif(btrim(product.web_description), '') is null
      then descriptions.short_description
    else product.web_description
  end,
  web_long_description = case
    when nullif(btrim(product.web_long_description), '') is null
      then descriptions.long_description
    else product.web_long_description
  end
from descriptions
where product.key = descriptions.key
  and (
    nullif(btrim(product.web_description), '') is null
    or nullif(btrim(product.web_long_description), '') is null
  );
