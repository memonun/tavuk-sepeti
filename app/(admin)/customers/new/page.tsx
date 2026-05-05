import Link from "next/link";

import { CustomerForm } from "@/features/customers/ui/customer-form";
import { env } from "@/shared/env";

export default function NewCustomerPage() {
  const mapsKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!mapsKey) {
    return (
      <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-6 text-sm text-orange-700 dark:text-orange-300">
        {`Google Maps tarayıcı anahtarı .env'de tanımlı değil — adres pin'i için gerekli.`}{" "}
        <code>NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY</code> değerini ekle ve
        sunucuyu yeniden başlat.
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/customers" className="hover:underline">
            ← Müşteriler
          </Link>
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Yeni Müşteri</h2>
        <p className="text-sm text-muted-foreground">
          Bilgileri gir, adresi yaz — pin otomatik oluşur, sürükleyerek
          düzeltebilirsin.
        </p>
      </div>

      <CustomerForm mapsBrowserKey={mapsKey} mode={{ kind: "create" }} />
    </div>
  );
}
