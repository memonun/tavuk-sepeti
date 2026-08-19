"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import { bulkDeleteCustomersAction } from "@/features/customers/application/bulk-delete-customers";
import { CustomerForm } from "@/features/customers/ui/customer-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Customer } from "@/features/customers/domain/customer";
import type { CustomerFormInput } from "@/features/customers/domain/customer.schema";

interface CustomerDetailPanelProps {
  readonly customer: Customer;
  readonly mapsKey: string;
  /** Slot for the customer's orders list (filled by a later plan). */
  readonly ordersSlot?: ReactNode;
  /** Slot for the customer's recurring templates list. */
  readonly recurringSlot?: ReactNode;
  /** Called right before navigating away after a successful delete, so a
   *  caller rendering this inside a Sheet can close it first. */
  readonly onDeleted?: () => void;
}

export function CustomerDetailPanel({
  customer,
  mapsKey,
  ordersSlot,
  recurringSlot,
  onDeleted,
}: CustomerDetailPanelProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();

  const confirmDelete = () => {
    startDeleting(async () => {
      const result = await bulkDeleteCustomersAction([customer.id]);
      if (result.ok) {
        toast.success(
          `${[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Müşteri"} silindi.`,
        );
        setDeleteOpen(false);
        onDeleted?.();
        router.push("/customers");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };
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
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          className="gap-1.5 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Müşteriyi Sil
        </Button>
      </div>

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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {[customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
                "Bu müşteri"}{" "}
              silinsin mi?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bu işlem geri alınamaz. Müşterinin siparişi varsa silme engellenir
            — bu durumda müşteriyi pasif duruma alabilirsin.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
