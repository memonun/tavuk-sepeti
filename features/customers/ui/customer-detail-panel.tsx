"use client";

import type { ReactNode } from "react";

import { CustomerForm } from "@/features/customers/ui/customer-form";
import type { Customer } from "@/features/customers/domain/customer";
import type { CustomerFormInput } from "@/features/customers/domain/customer.schema";

interface CustomerDetailPanelProps {
  readonly customer: Customer;
  readonly mapsKey: string;
  /** Slot for the customer's orders list (filled by a later plan). */
  readonly ordersSlot?: ReactNode;
  /** Slot for the customer's recurring templates list. */
  readonly recurringSlot?: ReactNode;
}

export function CustomerDetailPanel({
  customer,
  mapsKey,
  ordersSlot,
  recurringSlot,
}: CustomerDetailPanelProps) {
  // Domain entity → form input shape. The form's Zod schema accepts strings
  // for nullable fields (blank → null), so we coerce nulls to "" for inputs.
  // Phone is null for some CSV-imported customers (pazar etc.); the form
  // still requires it, so the admin types one in before saving.
  const defaultValues: CustomerFormInput = {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    notes: customer.notes ?? "",
    status: customer.status,
    address: {
      city: customer.address?.city ?? "",
      district: customer.address?.district ?? "",
      neighborhood: customer.address?.neighborhood ?? "",
      street: customer.address?.street ?? "",
      building_no: customer.address?.building_no ?? "",
      apartment_no: customer.address?.apartment_no ?? "",
      postal_code: customer.address?.postal_code ?? "",
      description: customer.address?.description ?? "",
      lat: customer.address?.coordinate.lat ?? 0,
      lng: customer.address?.coordinate.lng ?? 0,
      source: customer.address?.coordinate.source ?? "geocoded_auto",
      accuracy: customer.address?.coordinate.accuracy ?? "unknown",
    },
  };

  return (
    <div className="space-y-6">
      <CustomerForm
        mapsBrowserKey={mapsKey}
        mode={{
          kind: "edit",
          customerId: customer.id,
          defaultValues,
        }}
      />
      {ordersSlot}
      {recurringSlot}
    </div>
  );
}
