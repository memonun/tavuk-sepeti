import Link from "next/link";
import { notFound } from "next/navigation";

import { getCustomerById } from "@/features/customers/application/get-customer";
import { CustomerDetailPanel } from "@/features/customers/ui/customer-detail-panel";
import { CustomerOrdersList } from "@/features/orders/ui/customer-orders-list";
import { env } from "@/shared/env";

interface CustomerEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerEditPage({ params }: CustomerEditPageProps) {
  const { id } = await params;
  const result = await getCustomerById(id);
  if (!result.ok) notFound();
  const customer = result.value;

  const mapsKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!mapsKey) {
    return (
      <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-6 text-sm text-orange-700 dark:text-orange-300">
        Google Maps tarayıcı anahtarı eksik. Düzenleme için
        <code> NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY </code>
        gerekiyor.
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
        <h2 className="text-2xl font-semibold tracking-tight">
          {customer.first_name} {customer.last_name}
        </h2>
        <p className="text-sm text-muted-foreground">{customer.phone}</p>
      </div>

      <CustomerDetailPanel
        customer={customer}
        mapsKey={mapsKey}
        ordersSlot={<CustomerOrdersList customerId={id} />}
      />
    </div>
  );
}
