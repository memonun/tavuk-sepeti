"use client";

/**
 * Grouped category selector for the expense form — "Ana Kategori" as a
 * non-interactive group label, its children as the selectable rows. A
 * top-level category with no children (Pazar Giderleri, Yatırım / Demirbaş,
 * Diğer) is itself selectable — there's nothing to pick underneath it.
 *
 * A category WITH children is deliberately never itself selectable: the
 * spec is explicit that spending must land on a specific child ("Tavuk
 * Yemi", not the generic "Üretim Giderleri" catch-all) so the owner can
 * actually see where money goes.
 *
 * Base UI's Select only resolves the trigger's display label from the
 * `items` prop (PR #139) — every id below, selectable or not, must appear
 * in that map or the trigger will show a bare UUID once selected.
 */
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCategoryPath } from "@/features/finance/domain/expense-category";

import type { ExpenseCategoryNode } from "@/features/finance/domain/expense-category";

interface ExpenseCategorySelectProps {
  /** Active categories only — features/finance/domain/expense-category.ts's activeCategoryNodes. */
  categories: readonly ExpenseCategoryNode[];
  value: string;
  onValueChange: (categoryId: string) => void;
  id?: string;
  disabled?: boolean;
}

export function ExpenseCategorySelect({
  categories,
  value,
  onValueChange,
  id,
  disabled,
}: ExpenseCategorySelectProps) {
  const items: Record<string, string> = {};
  for (const parent of categories) {
    if (parent.children.length === 0) {
      items[parent.id] = formatCategoryPath(parent.name, null);
    } else {
      for (const child of parent.children) {
        items[child.id] = formatCategoryPath(child.name, parent.name);
      }
    }
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (typeof v === "string" && v) onValueChange(v);
      }}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Kategori seçin" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((parent) =>
          parent.children.length === 0 ? (
            <SelectItem key={parent.id} value={parent.id}>
              {parent.name}
            </SelectItem>
          ) : (
            <SelectGroup key={parent.id}>
              <SelectLabel>{parent.name}</SelectLabel>
              {parent.children.map((child) => (
                <SelectItem key={child.id} value={child.id}>
                  {child.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
