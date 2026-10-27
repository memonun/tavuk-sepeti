import { listShowcaseSlidesForAdmin } from "@/features/storefront/application/get-showcase";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { HeroTextForm } from "@/features/storefront/ui/hero-text-form";
import { ShowcaseManager } from "@/features/storefront/ui/showcase-manager";

/**
 * The home page showcase: the slogan, the sentence on the photos, and the
 * photos themselves. Everything here changes the shop's first screen on the
 * next request.
 */
export default async function ShowcasePage() {
  const [settings, slides] = await Promise.all([
    getStorefrontSettings(),
    listShowcaseSlidesForAdmin(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Vitrin</h2>
        <p className="text-sm text-muted-foreground">
          Mağaza ana sayfasının ilk ekranı: slogan, kayan fotoğraflar ve üstlerindeki cümle.
          Kaydedilen değişiklik mağazada anında geçerli olur.
        </p>
      </div>

      <section aria-labelledby="hero-text-heading" className="space-y-3">
        <h3 id="hero-text-heading" className="text-lg font-semibold">
          Metin
        </h3>
        <HeroTextForm heroTitle={settings.heroTitle} heroSubtitle={settings.heroSubtitle} />
      </section>

      <section aria-labelledby="photos-heading" className="max-w-xl space-y-3">
        <h3 id="photos-heading" className="text-lg font-semibold">
          Fotoğraflar
        </h3>
        <p className="text-sm text-muted-foreground">
          Ana sayfada bu sırayla kayarlar. Okla sırasını değiştirin, kaydırıcıyla fotoğrafın hangi
          kısmının görüneceğini seçin.
        </p>
        {slides.ok ? (
          <ShowcaseManager slides={slides.value} />
        ) : (
          <p className="text-sm text-destructive" role="alert">
            Vitrin fotoğrafları şu an okunamadı. Sayfayı yenileyip tekrar deneyin.
          </p>
        )}
      </section>
    </div>
  );
}
