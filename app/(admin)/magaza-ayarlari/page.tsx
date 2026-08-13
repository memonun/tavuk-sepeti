import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { StorefrontSettingsForm } from "@/features/storefront/ui/storefront-settings-form";

/**
 * Storefront rules the owner changes without a deploy: the days the van goes
 * out, and the out-of-city order floor. Everything else about the shop
 * (products, prices, visibility) already lives under /products.
 */
export default async function StorefrontSettingsPage() {
  const settings = await getStorefrontSettings();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Mağaza ayarları</h2>
        <p className="text-sm text-muted-foreground">
          Eve servis günleri ve şehir dışı sipariş alt limiti. Kaydedilen
          değişiklik mağazada anında geçerli olur.
        </p>
      </div>
      <StorefrontSettingsForm
        homeDeliveryDays={settings.homeDeliveryDays}
        cargoMinOrderMinor={settings.cargoMinOrderMinor}
      />
    </div>
  );
}
