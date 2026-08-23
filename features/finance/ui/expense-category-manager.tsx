"use client";

/**
 * Kategorileri Yönet — add/rename/reorder/archive expense categories.
 * Mirrors market-location-manager.tsx's dialog shape, extended for a
 * two-level tree: Ana Kategori rows, each with its Alt Kategori children
 * indented underneath. New categories are only created here (never by
 * accidental free typing in the expense form — spec §6).
 *
 * A category with historical expenses is never hard-deleted (there's no
 * delete action at all here) — only "Pasife Al" / "Aktifleştir".
 */
import { ChevronDown, ChevronUp, FolderTree, Loader2, Pencil, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createExpenseCategoryAction,
  setExpenseCategoryActiveAction,
  updateExpenseCategoryAction,
} from "@/features/finance/application/expense-category-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { ExpenseCategoryNode } from "@/features/finance/domain/expense-category";

export function ExpenseCategoryManager({
  categories,
}: {
  categories: readonly ExpenseCategoryNode[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newParentName, setNewParentName] = useState("");
  const [newChildName, setNewChildName] = useState("");
  const [newChildParentId, setNewChildParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pending, startPending] = useTransition();

  const activeParents = categories.filter((c) => c.active);
  const parentItems: Record<string, string> = Object.fromEntries(
    activeParents.map((p) => [p.id, p.name]),
  );

  const refresh = () => router.refresh();

  const addParent = () => {
    const name = newParentName.trim();
    if (name === "") return;
    startPending(async () => {
      const result = await createExpenseCategoryAction({
        name,
        parent_id: null,
        sort_order: categories.length,
      });
      if (result.ok) {
        toast.success(`${name} eklendi.`);
        setNewParentName("");
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const addChild = () => {
    const name = newChildName.trim();
    if (name === "" || newChildParentId === "") return;
    const parent = categories.find((c) => c.id === newChildParentId);
    startPending(async () => {
      const result = await createExpenseCategoryAction({
        name,
        parent_id: newChildParentId,
        sort_order: parent?.children.length ?? 0,
      });
      if (result.ok) {
        toast.success(`${name} eklendi.`);
        setNewChildName("");
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const startRename = (node: ExpenseCategoryNode) => {
    setEditingId(node.id);
    setEditingName(node.name);
  };

  const saveRename = (node: ExpenseCategoryNode) => {
    const name = editingName.trim();
    if (name === "") return;
    startPending(async () => {
      const result = await updateExpenseCategoryAction({
        id: node.id,
        name,
        parent_id: node.parent_id,
        sort_order: node.sort_order,
      });
      if (result.ok) {
        setEditingId(null);
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const toggleActive = (node: ExpenseCategoryNode) => {
    startPending(async () => {
      const result = await setExpenseCategoryActiveAction({ id: node.id, active: !node.active });
      if (result.ok) refresh();
      else toast.error(result.error.message);
    });
  };

  /** Swaps sort_order with the adjacent sibling in `siblings` (top-level
   *  categories, or one parent's children). */
  const move = (siblings: readonly ExpenseCategoryNode[], index: number, direction: "up" | "down") => {
    const otherIndex = direction === "up" ? index - 1 : index + 1;
    const a = siblings[index];
    const b = siblings[otherIndex];
    if (!a || !b) return;
    startPending(async () => {
      const [resA, resB] = await Promise.all([
        updateExpenseCategoryAction({ id: a.id, name: a.name, parent_id: a.parent_id, sort_order: b.sort_order }),
        updateExpenseCategoryAction({ id: b.id, name: b.name, parent_id: b.parent_id, sort_order: a.sort_order }),
      ]);
      if (!resA.ok) toast.error(resA.error.message);
      else if (!resB.ok) toast.error(resB.error.message);
      else refresh();
    });
  };

  const renderRow = (
    node: ExpenseCategoryNode,
    siblings: readonly ExpenseCategoryNode[],
    index: number,
    indent: boolean,
  ) => (
    <li
      key={node.id}
      className={`flex items-center gap-2 rounded-lg border p-2 ${indent ? "ml-6" : ""}`}
    >
      {editingId === node.id ? (
        <>
          <Input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            disabled={pending}
            className="h-8 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveRename(node);
              }
            }}
          />
          <Button type="button" size="sm" disabled={pending} onClick={() => saveRename(node)}>
            Kaydet
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditingId(null)}>
            Vazgeç
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</span>
          {!node.active ? <Badge variant="secondary">Pasif</Badge> : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Yeniden adlandır"
            disabled={pending}
            onClick={() => startRename(node)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              disabled={pending || index === 0}
              aria-label="Yukarı taşı"
              className="text-muted-foreground disabled:opacity-30"
              onClick={() => move(siblings, index, "up")}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={pending || index === siblings.length - 1}
              aria-label="Aşağı taşı"
              className="text-muted-foreground disabled:opacity-30"
              onClick={() => move(siblings, index, "down")}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <Switch
            checked={node.active}
            onCheckedChange={() => toggleActive(node)}
            disabled={pending}
            aria-label={node.active ? "Pasife al" : "Aktifleştir"}
          />
        </>
      )}
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Kategorileri Yönet
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gider Kategorileri</DialogTitle>
          <DialogDescription>
            En fazla iki seviye: Ana Kategori → Alt Kategori. Pasif kategoriler
            yeni giderlerde seçilemez, geçmiş giderlerde görünmeye devam eder.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {categories.length === 0 ? (
            <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Henüz kategori yok.
            </li>
          ) : null}
          {categories.map((parent, parentIndex) => (
            <div key={parent.id} className="flex flex-col gap-2">
              {renderRow(parent, categories, parentIndex, false)}
              {parent.children.map((child, childIndex) => renderRow(child, parent.children, childIndex, true))}
            </div>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex gap-2">
            <FolderTree className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              value={newParentName}
              onChange={(e) => setNewParentName(e.target.value)}
              placeholder="Yeni Ana Kategori adı"
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addParent();
                }
              }}
            />
            <Button type="button" variant="outline" disabled={pending || newParentName.trim() === ""} onClick={addParent}>
              Ekle
            </Button>
          </div>

          <div className="flex gap-2">
            <Select value={newChildParentId} onValueChange={(v) => typeof v === "string" && setNewChildParentId(v)} items={parentItems}>
              <SelectTrigger className="w-40 shrink-0">
                <SelectValue placeholder="Ana Kategori" />
              </SelectTrigger>
              <SelectContent>
                {activeParents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newChildName}
              onChange={(e) => setNewChildName(e.target.value)}
              placeholder="Yeni Alt Kategori adı"
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChild();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending || newChildName.trim() === "" || newChildParentId === ""}
              onClick={addChild}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ekle"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
