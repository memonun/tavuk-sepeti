"use client";

import { CircleCheck, CircleX, Clock, Package, PackageCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CellEditor } from "@/components/data-grid/data-grid-types";
import { allowedTransitions } from "@/features/orders/domain/order-state-machine";
import { orderCellPatchSchemas } from "@/features/orders/domain/order.schema";
import type { OrderStatus } from "@/features/orders/domain/order";

const LABELS: Record<OrderStatus, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylı",
  shipped: "Kargolandı",
  delivered: "Teslim",
  cancelled: "İptal",
};

const VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  confirmed: "default",
  shipped: "outline",
  delivered: "outline",
  cancelled: "destructive",
};

// Status is conveyed by icon + text, never colour alone (WCAG 1.4.1).
const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  pending: Clock,
  confirmed: CircleCheck,
  shipped: Package,
  delivered: PackageCheck,
  cancelled: CircleX,
};

export const orderStatusEditor: CellEditor<OrderStatus> = {
  // The grid pre-validates the committed raw value against this schema
  // before dispatching. The status editor commits a `{ to, reason }`
  // object (not a bare enum), so we reuse the domain patch schema here —
  // a plain enum would reject every transition. The cast keeps the
  // CellEditor<OrderStatus> generic happy; at runtime it validates the
  // object that `edit` actually commits.
  schema: orderCellPatchSchemas.status as unknown as z.ZodType<OrderStatus>,
  render: (value) => {
    const Icon = STATUS_ICON[value];
    return (
      <Badge variant={VARIANT[value]} className="gap-1">
        <Icon className="h-3 w-3" aria-hidden />
        {LABELS[value]}
      </Badge>
    );
  },
  edit: ({ value, onCommit, onCancel }) => (
    <StatusInput current={value} onCommit={onCommit} onCancel={onCancel} />
  ),
};

function StatusInput({
  current,
  onCommit,
  onCancel,
}: {
  readonly current: OrderStatus;
  readonly onCommit: (raw: unknown) => void;
  readonly onCancel: () => void;
}) {
  const targets = allowedTransitions(current);
  const [selectOpen, setSelectOpen] = useState(true);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [reason, setReason] = useState("");

  // Terminal status — nothing to transition to. Exit edit mode cleanly.
  useEffect(() => {
    if (targets.length === 0) {
      onCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (targets.length === 0) {
    return null;
  }

  return (
    <>
      <Select
        open={selectOpen}
        onOpenChange={(open) => {
          setSelectOpen(open);
          if (!open && !pendingCancel) {
            onCancel();
          }
        }}
        defaultValue={current}
        onValueChange={(to) => {
          if (to === "cancelled") {
            setSelectOpen(false);
            setPendingCancel(true);
          } else {
            onCommit({ to, reason: null });
            setSelectOpen(false);
          }
        }}
      >
        <SelectTrigger className="h-full w-full border-0 bg-transparent px-2 ring-0" autoFocus>
          <SelectValue placeholder={LABELS[current]} />
        </SelectTrigger>
        <SelectContent>
          {targets.map((t) => (
            <SelectItem key={t} value={t}>
              {LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog
        open={pendingCancel}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCancel(false);
            onCancel();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>İptal nedeni</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Neden iptal ediliyor?"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingCancel(false);
                onCancel();
              }}
            >
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length === 0}
              onClick={() => onCommit({ to: "cancelled", reason })}
            >
              İptal et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
