"use client";

/**
 * "+ Yeni Müşteri Ekle" trigger for the bulk order screen: opens the same
 * CustomerForm used by /customers/new inside a side sheet, so an admin
 * mid-order never leaves the page to register a customer. Composed here
 * (app-route layer) rather than inside features/orders/ui, since a feature's
 * UI may not import another feature's UI directly (see eslint.config.mjs).
 */
import { UserPlus } from "lucide-react";
import { useState } from "react";

import { CustomerForm } from "@/features/customers/ui/customer-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface NewCustomerActionProps {
  mapsBrowserKey: string;
  onCreated?: (customer: { id: string; name: string; phone: string }) => void;
}

export function NewCustomerAction({ mapsBrowserKey, onCreated }: NewCustomerActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" />}
      >
        <UserPlus className="size-3.5" />
        Yeni Müşteri Ekle
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Yeni Müşteri Ekle</SheetTitle>
        </SheetHeader>
        <div className="px-4 py-4">
          <CustomerForm
            mapsBrowserKey={mapsBrowserKey}
            mode={{ kind: "create" }}
            onCancel={() => setOpen(false)}
            onCreated={(customer) => {
              setOpen(false);
              onCreated?.({
                id: customer.id,
                name:
                  [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
                  "(isimsiz)",
                phone: customer.phone,
              });
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
