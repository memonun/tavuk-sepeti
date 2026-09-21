"use client";

/**
 * "+ Yeni Müşteri Ekle" trigger: opens the same CustomerForm used by
 * /customers/new inside a side sheet, so an admin never has to leave the
 * current page (bulk order screen, orders list, …) to register a customer.
 * Lives at the app-route layer (not inside features/orders/ui) since a
 * feature's UI may not import another feature's UI directly (see
 * eslint.config.mjs) — shared across admin routes from here.
 */
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
      {/* The width classes carry the `data-[side=right]:` variant on purpose: the
          Sheet primitive sets `data-[side=right]:w-3/4` and
          `data-[side=right]:sm:max-w-sm`, and a plain `w-full sm:max-w-2xl`
          loses to those (data-attribute selectors are more specific), which is
          what kept this panel at 384px. */}
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl"
      >
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
              const name =
                [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
                "(isimsiz)";
              toast.success(`${name} eklendi.`);
              onCreated?.({ id: customer.id, name, phone: customer.phone });
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
