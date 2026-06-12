"use client";

/**
 * Notion-style filter builder popover. Toolbar button shows the active rule
 * count; clicking opens a popover with one row per rule (column / operator /
 * value / remove) plus an "+ Add filter" footer.
 *
 * Type-aware: each column declares a `kind` (text/number/date/select). The
 * operator dropdown and the value editor adapt to it — date columns get
 * before/after/between + relative presets (bugün / bu hafta / bu ay), selects
 * get a value dropdown, numbers get a number input. Single AND group; each
 * change fires onChange immediately (no Apply/Cancel — reactive like Notion).
 */
import { Filter, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  DEFAULT_OPERATOR_BY_KIND,
  FILTER_OPERATOR_LABELS,
  OPERATORS_BY_KIND,
  RANGE_OPERATORS,
  VALUELESS_OPERATORS,
  type FilterColumnKind,
  type FilterOperator,
  type FilterRule,
  type FilterableColumn,
} from "@/components/data-grid/filters/filter-types";

interface FilterBuilderProps {
  readonly columns: ReadonlyArray<FilterableColumn>;
  readonly rules: ReadonlyArray<FilterRule>;
  readonly onChange: (next: ReadonlyArray<FilterRule>) => void;
}

function newRuleId() {
  return `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

const kindOf = (col: FilterableColumn | undefined): FilterColumnKind =>
  col?.kind ?? "text";

export function FilterBuilder({ columns, rules, onChange }: FilterBuilderProps) {
  const [open, setOpen] = useState(false);
  const activeCount = rules.length;

  const updateRule = (id: string, patch: Partial<FilterRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRule = (id: string) => onChange(rules.filter((r) => r.id !== id));
  const addRule = () => {
    const firstCol = columns[0];
    if (!firstCol) return;
    const next: FilterRule = {
      id: newRuleId(),
      column: firstCol.id,
      operator: DEFAULT_OPERATOR_BY_KIND[kindOf(firstCol)],
      value: "",
      value2: "",
    };
    onChange([...rules, next]);
  };
  const clearAll = () => onChange([]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant={activeCount > 0 ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "h-7 gap-1 px-2 text-xs",
              activeCount > 0 &&
                "bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-100",
            )}
          />
        }
      >
        <Filter className="h-3 w-3" />
        {activeCount > 0 ? `Filtre · ${activeCount}` : "Filtre"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,620px)] p-2">
        {rules.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            Filtre yok. Aşağıdan ekle.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rules.map((rule, idx) => (
              <RuleRow
                key={rule.id}
                conjunctionLabel={idx === 0 ? "Nerede" : "ve"}
                columns={columns}
                rule={rule}
                onUpdate={(patch) => updateRule(rule.id, patch)}
                onRemove={() => removeRule(rule.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={addRule}
            disabled={columns.length === 0}
          >
            <Plus className="h-3 w-3" />
            Filtre ekle
          </Button>
          {rules.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            >
              Temizle
            </Button>
          ) : (
            <DropdownMenuItem className="hidden" />
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RuleRowProps {
  readonly conjunctionLabel: string;
  readonly columns: ReadonlyArray<FilterableColumn>;
  readonly rule: FilterRule;
  readonly onUpdate: (patch: Partial<FilterRule>) => void;
  readonly onRemove: () => void;
}

function RuleRow({
  conjunctionLabel,
  columns,
  rule,
  onUpdate,
  onRemove,
}: RuleRowProps) {
  const column = columns.find((c) => c.id === rule.column);
  const kind = kindOf(column);
  const operators = OPERATORS_BY_KIND[kind];
  const isValueless = VALUELESS_OPERATORS.has(rule.operator);
  const isRange = RANGE_OPERATORS.has(rule.operator);

  // Switching column resets the operator to that kind's default + clears values
  // (a date operator on a text column would be meaningless).
  const onColumnChange = (nextId: string) => {
    const nextKind = kindOf(columns.find((c) => c.id === nextId));
    onUpdate({
      column: nextId,
      operator: DEFAULT_OPERATOR_BY_KIND[nextKind],
      value: "",
      value2: "",
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
        {conjunctionLabel}
      </span>

      <Select value={rule.column} onValueChange={(v) => v && onColumnChange(v)}>
        <SelectTrigger size="sm" className="h-7 w-32 px-2 text-xs">
          <SelectValue>
            {(v: unknown) =>
              columns.find((c) => c.id === v)?.label ?? String(v ?? "")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={rule.operator}
        onValueChange={(v) => v && onUpdate({ operator: v as FilterOperator })}
      >
        <SelectTrigger size="sm" className="h-7 w-32 px-2 text-xs">
          <SelectValue>
            {(v: unknown) =>
              FILTER_OPERATOR_LABELS[v as FilterOperator] ?? String(v ?? "")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>
              {FILTER_OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isValueless ? (
        <div className="flex-1" />
      ) : isRange ? (
        <div className="flex flex-1 items-center gap-1">
          <Input
            type="date"
            value={rule.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            className="h-7 flex-1 px-2 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">—</span>
          <Input
            type="date"
            value={rule.value2}
            onChange={(e) => onUpdate({ value2: e.target.value })}
            className="h-7 flex-1 px-2 text-xs"
          />
        </div>
      ) : kind === "select" && column?.options ? (
        <Select
          value={rule.value}
          onValueChange={(v) => onUpdate({ value: v ?? "" })}
        >
          <SelectTrigger size="sm" className="h-7 flex-1 px-2 text-xs">
            <SelectValue placeholder="Seç…">
              {(v: unknown) =>
                column.options?.find((o) => o.value === v)?.label ??
                String(v ?? "")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {column.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
          value={rule.value}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="Değer…"
          className="h-7 flex-1 px-2 text-xs"
        />
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        onClick={onRemove}
        aria-label="Filtreyi sil"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
