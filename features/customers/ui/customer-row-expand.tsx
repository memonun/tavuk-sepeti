"use client";

/**
 * Inline expand panel rendered below a row in the Customers DataGrid.
 *
 * Faz 1.2 keeps this lightweight — quick read-only summary of the row's
 * key attributes plus a deep-link to the full detail page. Faz 2 can
 * fold in recent orders + audit timeline once realtime is wired.
 */
import Link from "next/link";

import { formatDate } from "@/shared/utils/date";
import { formatTRPhone } from "@/shared/utils/phone";

import type { CustomerListItem } from "@/features/customers/domain/customer";

const STATUS_LABEL: Record<CustomerListItem["status"], string> = {
  active: "Aktif",
  inactive: "Pasif",
  blocked: "Engelli",
};

const ACCOUNT_LABEL: Record<CustomerListItem["account_type"], string> = {
  individual: "Birey",
  business: "İşletme",
  charity: "Vakıf",
  bazaar_vendor: "Pazar",
};

interface CustomerRowExpandProps {
  readonly customer: CustomerListItem;
}

export function CustomerRowExpand({ customer }: CustomerRowExpandProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {customer.first_name} {customer.last_name}
        </h3>
        <p className="text-xs text-muted-foreground">
          Eklenme: {formatDate(customer.created_at)}
        </p>
      </div>

      <dl className="space-y-1 text-xs">
        <Row label="Telefon">
          {customer.phone ? (
            <span className="font-mono">{formatTRPhone(customer.phone)}</span>
          ) : (
            <Empty />
          )}
        </Row>
        <Row label="E-posta">{customer.email ?? <Empty />}</Row>
        <Row label="Şehir">{customer.city ?? <Empty />}</Row>
      </dl>

      <dl className="space-y-1 text-xs">
        <Row label="Tip">{ACCOUNT_LABEL[customer.account_type]}</Row>
        <Row label="Kanal">{customer.tag ?? <Empty />}</Row>
        <Row label="Segment">{customer.legacy_segment ?? <Empty />}</Row>
        <Row label="Durum">{STATUS_LABEL[customer.status]}</Row>
        <li className="pt-2">
          <Link
            href={`/customers/${customer.id}`}
            className="text-xs underline underline-offset-2 hover:text-foreground"
          >
            Tam detayı aç →
          </Link>
        </li>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </li>
  );
}

function Empty() {
  return <span className="text-muted-foreground">—</span>;
}
