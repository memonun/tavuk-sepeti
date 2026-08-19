"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteMarketSaleAction,
  getMarketSaleDetailAction,
} from "@/features/finance/application/market-sale-actions";
import { MarketSaleFormDialog } from "@/features/finance/ui/market-sale-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { MarketSale, MarketSaleListItem } from "@/features/finance/domain/market-sale";
import type { MarketLocation } from "@/features/finance/domain/market-location";

interface ProductOption {
  key: string;
  display_name: string;
}

export function MarketSaleRowActions({
  listItem,
  locations,
  products,
}: {
  listItem: MarketSaleListItem;
  locations: MarketLocation[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detail, setDetail] = useState<MarketSale | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pending, startPending] = useTransition();

  const loadDetail = async () => {
    if (detail || loadingDetail) return;
    setLoadingDetail(true);
    const result = await getMarketSaleDetailAction(listItem.id);
    if (result.ok) setDetail(result.value);
    else toast.error(result.error.message);
    setLoadingDetail(false);
  };

  const confirmDelete = () => {
    startPending(async () => {
      const result = await deleteMarketSaleAction({ id: listItem.id });
      if (result.ok) {
        toast.success("Pazar satışı silindi.");
        setDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <MarketSaleFormDialog
        mode="edit"
        {...(detail ? { sale: detail } : {})}
        locations={locations}
        products={products}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Düzenle"
            onClick={loadDetail}
          >
            {loadingDetail ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </Button>
        }
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        aria-label="Sil"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pazar satışını sil</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bu pazar satışı kaydını silmek istediğine emin misin? Bu işlem geri alınamaz.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
