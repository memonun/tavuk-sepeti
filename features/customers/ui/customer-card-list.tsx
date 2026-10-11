"use client";

/**
 * Phone layout for the customers list: one card per customer instead of the
 * spreadsheet grid. Same rows, same search and filters, same detail panel on
 * tap. The grid is still reachable through the view toggle next to the search
 * box (bulk delete, inline editing and "Yeni satır" live there).
 */
import { ChevronRight, MapPin, Phone } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CustomerListItem } from "@/features/customers/domain/customer";
import {
  ACCOUNT_TYPE_OPTIONS,
  STATUS_OPTIONS,
} from "@/features/customers/ui/customer-grid-columns";

/** The list can hold up to GRID_PAGE_SIZE rows; cards are revealed in steps so
 *  a phone never has to lay out thousands of them at once. */
const STEP = 40;

function fullName(customer: CustomerListItem): string {
  const name = [customer.first_name, customer.last_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name.length > 0 ? name : "(isimsiz)";
}

export function CustomerCardList({
  items,
  onOpen,
}: {
  readonly items: readonly CustomerListItem[];
  readonly onOpen: (id: string) => void;
}) {
  const [visible, setVisible] = useState(STEP);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-base text-muted-foreground">
        Bu aramaya uyan müşteri yok.
      </p>
    );
  }

  const shown = items.slice(0, visible);
  const remaining = items.length - shown.length;

  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-(--admin-shadow-sm)">
        {shown.map((customer) => {
          const status = STATUS_OPTIONS.find((option) => option.value === customer.status);
          const accountType = ACCOUNT_TYPE_OPTIONS.find(
            (option) => option.value === customer.account_type,
          );
          return (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onOpen(customer.id)}
                className="admin-menu-row flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base leading-snug font-semibold [overflow-wrap:anywhere]">
                      {fullName(customer)}
                    </span>
                    {/* Only the exceptions are badged: an active individual is
                        the ordinary case and needs no label. */}
                    {status && customer.status !== "active" ? (
                      <Badge variant={status.badgeVariant}>{status.label}</Badge>
                    ) : null}
                    {accountType && customer.account_type !== "individual" ? (
                      <Badge variant="outline">{accountType.label}</Badge>
                    ) : null}
                    {customer.tag ? <Badge variant="secondary">{customer.tag}</Badge> : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                    {customer.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3.5 shrink-0" aria-hidden />
                        {customer.phone}
                      </span>
                    ) : null}
                    {customer.city ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {customer.city}
                      </span>
                    ) : null}
                    {!customer.phone && !customer.city ? <span>Telefon ve adres yok</span> : null}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {remaining > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => setVisible((count) => count + STEP)}
        >
          {Math.min(STEP, remaining)} müşteri daha göster ({remaining} kaldı)
        </Button>
      ) : null}
    </div>
  );
}
