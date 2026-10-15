import { getAdsPageData } from "@/features/ads/application/get-ads-page-data";
import { AdsChangeLog } from "@/features/ads/ui/ads-change-log";
import { AdsSettingsForm } from "@/features/ads/ui/ads-settings-form";

/**
 * Meta ads: the spending limits Claude must stay within, and the report of
 * every change it made. The ads themselves are managed through the panel's
 * MCP connector (claude.ai), not on this page.
 */
export default async function AdsPage() {
  const data = await getAdsPageData();
  if (!data.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        {data.error.message}
      </div>
    );
  }
  const { connection, settings, changes, changesError } = data.value;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Reklam</h2>
        <p className="text-sm text-muted-foreground">
          Meta (Facebook ve Instagram) reklamlarını Claude yönetir; bu sayfa onun uyması gereken limitleri ve yaptığı her değişikliği gösterir.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Bağlantı</h3>
        <ul className="space-y-1 text-sm">
          <ConnectionRow ok={connection.configured} label="Meta reklam hesabı" missing="META_ADS_ACCESS_TOKEN ve META_AD_ACCOUNT_ID tanımlı değil" />
          <ConnectionRow ok={connection.page} label="Facebook sayfası (yeni reklam açmak için)" missing="META_PAGE_ID tanımlı değil" />
          <ConnectionRow ok={connection.instagram} label="Instagram hesabı" missing="META_INSTAGRAM_USER_ID tanımlı değil; reklamlar Instagram'da sayfa adıyla görünür" />
          <ConnectionRow ok={connection.pixel} label="Meta Pixel (satış kampanyaları için)" missing="NEXT_PUBLIC_META_PIXEL_ID tanımlı değil" />
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Harcama limitleri</h3>
        <AdsSettingsForm settings={settings} />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Yapılan değişiklikler</h3>
        <AdsChangeLog changes={changes} error={changesError} />
      </section>
    </div>
  );
}

function ConnectionRow({ ok, label, missing }: { ok: boolean; label: string; missing: string }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden>{ok ? "✓" : "–"}</span>
      <span>
        <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
        {ok ? null : <span className="block text-xs text-muted-foreground">{missing}</span>}
      </span>
    </li>
  );
}
