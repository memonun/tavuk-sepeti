"use client";

/**
 * Notion-style tab bar above the grid. Each tab is a saved View; the
 * active tab is the one currently driving the URL state. Clicking a
 * tab navigates to a URL that carries that view's filters/sort/
 * grouping, and the page's Server Component re-fetches under the
 * applied config.
 *
 * Tab actions (rename / duplicate / delete / set default) live in a
 * dropdown that hover-reveals on the active tab. "+ Yeni görünüm"
 * captures the CURRENT URL state as a new view.
 */
import {
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createViewAction } from "@/features/views/application/create-view";
import { deleteViewAction } from "@/features/views/application/delete-view";
import { updateViewAction } from "@/features/views/application/update-view";
import {
  EMPTY_VIEW_CONFIG,
  type View,
  type ViewConfig,
} from "@/features/views/domain/view";
import { buildViewSearchParams } from "@/features/views/ui/view-url";
import {
  readColumnPrefs,
  writeColumnPrefs,
} from "@/components/data-grid/hooks/use-column-prefs";
import { EMPTY_COLUMN_PREFS } from "@/components/data-grid/data-grid-types";

interface ViewTabsProps {
  readonly views: ReadonlyArray<View>;
  readonly tableId: string;
  readonly currentViewId: string | null;
  /** URL keys that count as part of the "filter state" — anything
   *  outside this set (e.g., page, view) is left out when capturing
   *  the current URL into a new view. */
  readonly filterKeys: ReadonlyArray<string>;
}

export function ViewTabs({
  views,
  tableId,
  currentViewId,
  filterKeys,
}: ViewTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

  const goToView = (view: View | null) => {
    // Switch tabs:
    //   1. Persist the view's columnState into the grid's localStorage
    //      key — the grid re-mounts on the next render and picks it up
    //      from the same store as the manual-prefs path.
    //   2. Update the URL (filters / sort / view marker).
    // Switching to "Tümü" (view === null) leaves the localStorage prefs
    // alone — the user's last manual column layout survives.
    if (view) {
      writeColumnPrefs(tableId, {
        version: 1,
        sizes: { ...view.config.columnState.sizes },
        order: [...view.config.columnState.order],
        hidden: [...view.config.columnState.hidden],
        pinning: {
          left: [...view.config.columnState.pinning.left],
          right: [...view.config.columnState.pinning.right],
        },
        aggregates: { ...view.config.columnState.aggregates },
      });
    }
    const next = buildViewSearchParams(view);
    const search = next.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      }),
    );
  };

  const captureCurrentConfig = (): ViewConfig => {
    const filters: Record<string, string> = {};
    for (const key of filterKeys) {
      const v = params.get(key);
      if (v) filters[key] = v;
    }
    const sortColumn = params.get("sort");
    const sortOrder = params.get("order");
    // Snapshot the grid's current column layout from localStorage so
    // saving a view captures sizes / order / visibility / pinning /
    // aggregates the user has already arranged.
    const prefs = readColumnPrefs(tableId) ?? EMPTY_COLUMN_PREFS;
    return {
      ...EMPTY_VIEW_CONFIG,
      filters,
      sort:
        sortColumn && (sortOrder === "asc" || sortOrder === "desc")
          ? { column: sortColumn, order: sortOrder }
          : null,
      columnState: {
        sizes: { ...prefs.sizes },
        order: [...prefs.order],
        hidden: [...prefs.hidden],
        pinning: {
          left: [...prefs.pinning.left],
          right: [...prefs.pinning.right],
        },
        aggregates: { ...prefs.aggregates },
      },
    };
  };

  // revalidatePath on the server only invalidates the cache; the
  // client still has the stale view list in memory. router.refresh()
  // re-renders the Server Component tree with the new data.
  const refreshTabs = () => router.refresh();

  const submitNewView = async () => {
    const name = draftName.trim();
    if (name.length === 0) return;
    const result = await createViewAction({
      table_id: tableId,
      name,
      config: captureCurrentConfig(),
      is_default: false,
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Görünüm eklendi.");
    setCreating(false);
    setDraftName("");
    refreshTabs();
    goToView(result.value);
  };

  const renameView = async (view: View, name: string) => {
    const trimmed = name.trim();
    // Skip the round-trip when the value is empty or unchanged. onBlur
    // fires on every focus loss (including clicking the menu trigger)
    // so without this guard we'd send a write on every blur.
    if (trimmed.length === 0 || trimmed === view.name) return;
    const result = await updateViewAction({ id: view.id, name: trimmed });
    if (!result.ok) toast.error(result.error.message);
    else {
      toast.success("Görünüm yeniden adlandırıldı.");
      refreshTabs();
    }
  };

  const duplicateView = async (view: View) => {
    const result = await createViewAction({
      table_id: view.tableId,
      name: `${view.name} kopya`,
      config: view.config,
      is_default: false,
    });
    if (!result.ok) toast.error(result.error.message);
    else {
      toast.success("Görünüm kopyalandı.");
      refreshTabs();
      goToView(result.value);
    }
  };

  const removeView = async (view: View) => {
    const result = await deleteViewAction(view.id);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Görünüm silindi.");
    refreshTabs();
    if (currentViewId === view.id) goToView(null);
  };

  const setDefault = async (view: View) => {
    const result = await updateViewAction({
      id: view.id,
      is_default: !view.isDefault,
    });
    if (!result.ok) toast.error(result.error.message);
    else {
      toast.success(
        view.isDefault ? "Varsayılan kaldırıldı." : "Varsayılan ayarlandı.",
      );
      refreshTabs();
    }
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-border px-1">
      {/* "All" tab — clears the view marker, keeps any in-flight URL state */}
      <ViewTab
        active={currentViewId === null}
        label="Tümü"
        onClick={() => goToView(null)}
        disabled={pending}
      />
      {views.map((view) => (
        <ViewTab
          key={view.id}
          active={currentViewId === view.id}
          label={view.name}
          isDefault={view.isDefault}
          disabled={pending}
          onClick={() => goToView(view)}
          onRename={(name) => renameView(view, name)}
          onDuplicate={() => duplicateView(view)}
          onDelete={() => removeView(view)}
          onToggleDefault={() => setDefault(view)}
        />
      ))}

      {/* "+ New view" inline input */}
      {creating ? (
        <div className="ml-1 flex items-center gap-1">
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Görünüm adı…"
            className="h-6 w-32 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNewView();
              if (e.key === "Escape") {
                setCreating(false);
                setDraftName("");
              }
            }}
            onBlur={() => {
              if (draftName.trim().length === 0) setCreating(false);
            }}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-0.5 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setCreating(true)}
          title="Geçerli filtreyi yeni görünüm olarak kaydet"
        >
          <Plus className="h-3 w-3" />
          Yeni görünüm
        </Button>
      )}
    </div>
  );
}

interface ViewTabProps {
  readonly active: boolean;
  readonly label: string;
  readonly disabled?: boolean;
  readonly isDefault?: boolean;
  readonly onClick: () => void;
  readonly onRename?: (name: string) => Promise<void> | void;
  readonly onDuplicate?: () => Promise<void> | void;
  readonly onDelete?: () => Promise<void> | void;
  readonly onToggleDefault?: () => Promise<void> | void;
}

function ViewTab({
  active,
  label,
  disabled,
  isDefault,
  onClick,
  onRename,
  onDuplicate,
  onDelete,
  onToggleDefault,
}: ViewTabProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(label);

  if (renaming) {
    return (
      <Input
        autoFocus
        value={renameDraft}
        onChange={(e) => setRenameDraft(e.target.value)}
        className="h-6 w-32 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void onRename?.(renameDraft);
            setRenaming(false);
          }
          if (e.key === "Escape") {
            setRenameDraft(label);
            setRenaming(false);
          }
        }}
        onBlur={() => {
          void onRename?.(renameDraft);
          setRenaming(false);
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "group relative -mb-px flex items-center gap-1 border-b-2 border-transparent px-2.5 py-1.5",
        active && "border-foreground",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 text-xs",
          active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {isDefault ? <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> : null}
        {label}
      </button>
      {onRename || onDuplicate || onDelete || onToggleDefault ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100"
                aria-label="Görünüm menüsü"
              />
            }
          >
            <MoreHorizontal className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {onRename ? (
              <DropdownMenuItem
                className="text-xs"
                onClick={() => {
                  setRenameDraft(label);
                  setRenaming(true);
                }}
              >
                <Pencil className="mr-2 h-3 w-3" />
                Yeniden adlandır
              </DropdownMenuItem>
            ) : null}
            {onDuplicate ? (
              <DropdownMenuItem className="text-xs" onClick={() => void onDuplicate()}>
                <Check className="mr-2 h-3 w-3" />
                Çoğalt
              </DropdownMenuItem>
            ) : null}
            {onToggleDefault ? (
              <DropdownMenuItem
                className="text-xs"
                onClick={() => void onToggleDefault()}
              >
                {isDefault ? (
                  <>
                    <StarOff className="mr-2 h-3 w-3" />
                    Varsayılanı kaldır
                  </>
                ) : (
                  <>
                    <Star className="mr-2 h-3 w-3" />
                    Varsayılan yap
                  </>
                )}
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs text-destructive focus:text-destructive"
                  onClick={() => void onDelete()}
                >
                  <Trash2 className="mr-2 h-3 w-3" />
                  Sil
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
