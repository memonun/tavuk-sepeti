"use client";

/**
 * Customer-scoped recurring template list — mounts on the /customers/[id] page.
 *
 * Mirrors the CustomerOrdersList markup pattern (section + header + list).
 * Mutations: Düzenle (edit form in Dialog), Durdur/Devam (toggle active),
 * Sil (2-step inline confirm inside a Dialog — no window.confirm).
 *
 * DialogTrigger uses the base-ui `render` prop pattern (not shadcn's asChild).
 */

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  deleteRecurringTemplateAction,
  getRecurringTemplateAction,
  listCustomerRecurringTemplatesAction,
  setRecurringTemplateActiveAction,
} from "@/features/recurring/application/recurring-template-actions";
import { RecurringTemplateForm } from "@/features/recurring/ui/recurring-template-form";
import { formatDate } from "@/shared/utils/date";

import type { Product } from "@/features/products/application/list-products";
import type {
  RecurringCadence,
  RecurringTemplate,
  RecurringTemplateListItem,
} from "@/features/recurring/domain/recurring-template";

interface CustomerRecurringListProps {
  readonly customerId: string;
  readonly products: Product[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const DOW_LABELS = ["Pzr", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

function dowLabel(n: number): string {
  return DOW_LABELS[n] ?? String(n);
}

const CADENCE_LABELS: Record<RecurringCadence, string> = {
  weekly: "Haftalık",
  biweekly: "İki haftada bir",
  monthly: "Aylık",
};

function cadenceDayLabel(item: RecurringTemplateListItem): string {
  const cadenceStr = CADENCE_LABELS[item.cadence];
  if (item.cadence === "monthly" && item.day_of_month != null) {
    return `${cadenceStr} · ${item.day_of_month}.`;
  }
  if (item.day_of_week != null) {
    return `${cadenceStr} · ${dowLabel(item.day_of_week)}`;
  }
  return cadenceStr;
}

// ---------------------------------------------------------------------------
// Delete confirm dialog (inline 2-step, no window.confirm)
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  readonly templateId: string;
  readonly onDeleted: () => void;
}

function DeleteConfirmDialog({ templateId, onDeleted }: DeleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteRecurringTemplateAction(templateId);
    setDeleting(false);
    if (result.ok) {
      toast.success("Şablon silindi.");
      setOpen(false);
      onDeleted();
    } else {
      toast.error(result.error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" />
          ) as ReactElement
        }
      >
        Sil
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Şablonu sil</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Bu tekrarlanan sipariş şablonu kalıcı olarak silinecek. Emin misiniz?
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={deleting}
          >
            İptal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            {deleting ? "Siliniyor…" : "Evet, sil"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog — fetches the full template on demand
// ---------------------------------------------------------------------------

interface EditDialogProps {
  readonly templateId: string;
  readonly customerId: string;
  readonly products: Product[];
  readonly onSaved: () => void;
}

function EditDialog({ templateId, customerId, products, onSaved }: EditDialogProps) {
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [template, setTemplate] = useState<RecurringTemplate | null>(null);

  const handleOpen = async () => {
    setFetching(true);
    const result = await getRecurringTemplateAction(templateId);
    setFetching(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setTemplate(result.value);
    setOpen(true);
  };

  const handleSaved = (_saved: RecurringTemplate) => {
    toast.success("Şablon güncellendi.");
    setOpen(false);
    setTemplate(null);
    onSaved();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={fetching}
        onClick={() => void handleOpen()}
      >
        {fetching ? "…" : "Düzenle"}
      </Button>
      {template != null && (
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTemplate(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Şablonu düzenle</DialogTitle>
            </DialogHeader>
            <RecurringTemplateForm
              customerId={customerId}
              products={products}
              template={template}
              onSaved={handleSaved}
              onCancel={() => { setOpen(false); setTemplate(null); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main list component
// ---------------------------------------------------------------------------

export function CustomerRecurringList({
  customerId,
  products,
}: CustomerRecurringListProps) {
  const [items, setItems] = useState<RecurringTemplateListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    void listCustomerRecurringTemplatesAction(customerId).then((r) => {
      if (!active) return;
      if (r.ok) {
        setItems(r.value);
        setLoadError(null);
      } else {
        setLoadError(r.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [customerId]);

  useEffect(() => {
    return load();
  }, [load]);

  const handleToggleActive = async (id: string, currentlyActive: boolean) => {
    setTogglingId(id);
    const result = await setRecurringTemplateActiveAction(id, !currentlyActive);
    setTogglingId(null);
    if (result.ok) {
      toast.success(
        result.value.active ? "Şablon devam ettiriliyor." : "Şablon durduruldu.",
      );
      load();
    } else {
      toast.error(result.error.message);
    }
  };

  const handleMutated = () => {
    load();
  };

  if (loadError) {
    return (
      <p className="text-sm text-destructive">
        Şablonlar yüklenemedi: {loadError}
      </p>
    );
  }

  if (items === null) {
    return <p className="text-sm text-muted-foreground">Yükleniyor…</p>;
  }

  return (
    <section className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Tekrarlanan siparişler ({items.length})
        </h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              (
                <button
                  type="button"
                  className="text-xs underline-offset-2 hover:underline"
                />
              ) as ReactElement
            }
          >
            + Yeni
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Yeni tekrarlanan sipariş</DialogTitle>
            </DialogHeader>
            <RecurringTemplateForm
              customerId={customerId}
              products={products}
              onSaved={(_saved) => {
                toast.success("Şablon oluşturuldu.");
                setCreateOpen(false);
                load();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Henüz tekrarlanan sipariş yok.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              {/* Left: cadence + next run */}
              <div className="min-w-0 flex-1">
                <span className="font-medium">{cadenceDayLabel(item)}</span>
                <span className="ml-2 text-muted-foreground">
                  · {formatDate(item.next_run_at)}
                </span>
                <span className="ml-2 text-muted-foreground">
                  · {item.item_count} ürün
                </span>
              </div>

              {/* Right: badge + actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={item.active ? "default" : "secondary"}>
                  {item.active ? "Aktif" : "Durdu"}
                </Badge>

                <EditDialog
                  templateId={item.id}
                  customerId={customerId}
                  products={products}
                  onSaved={handleMutated}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={togglingId === item.id}
                  onClick={() => void handleToggleActive(item.id, item.active)}
                >
                  {togglingId === item.id
                    ? "…"
                    : item.active
                      ? "Durdur"
                      : "Devam"}
                </Button>

                <DeleteConfirmDialog
                  templateId={item.id}
                  onDeleted={handleMutated}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
