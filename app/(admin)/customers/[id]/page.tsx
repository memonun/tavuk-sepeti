import Link from "next/link";
import { notFound } from "next/navigation";

import { getCustomerById } from "@/features/customers/application/get-customer";
import { CustomerForm } from "@/features/customers/ui/customer-form";
import { env } from "@/shared/env";

import type { CustomerFormInput } from "@/features/customers/domain/customer.schema";

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

  // Domain entity → form input shape. The form's Zod schema accepts strings
  // for nullable fields (blank → null), so we coerce nulls to "" for inputs.
  // Phone is null for some CSV-imported customers (pazar etc.); the form
  // still requires it, so the admin types one in before saving.
  const defaultValues: CustomerFormInput = {
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    notes: customer.notes ?? "",
    status: customer.status,
    address: {
      city: customer.address.city ?? "",
      district: customer.address.district ?? "",
      neighborhood: customer.address.neighborhood ?? "",
      street: customer.address.street ?? "",
      building_no: customer.address.building_no ?? "",
      apartment_no: customer.address.apartment_no ?? "",
      postal_code: customer.address.postal_code ?? "",
      description: customer.address.description ?? "",
      lat: customer.address.coordinate.lat,
      lng: customer.address.coordinate.lng,
      source: customer.address.coordinate.source,
      accuracy: customer.address.coordinate.accuracy,
    },
  };

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

      <CustomerForm
        mapsBrowserKey={mapsKey}
        mode={{
          kind: "edit",
          customerId: customer.id,
          defaultValues,
        }}
      />
    </div>
  );
}
