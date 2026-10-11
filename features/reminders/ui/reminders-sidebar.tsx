"use client";

/**
 * The left column of Anımsatıcılar: the smart-list tiles (Bugün, Planlanan,
 * Tümü, Bayraklı, Tamamlanan) and "Listelerim". Selecting is plain link
 * navigation (`?liste=`), so the page stays a Server Component.
 */
import {
  CalendarDays,
  CalendarRange,
  Check,
  Flag,
  Inbox,
  List,
  Pencil,
  Plus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createReminderListAction,
  deleteReminderListAction,
  updateReminderListAction,
} from "@/features/reminders/application/reminder-list-actions";
import {
  SMART_LIST_LABELS,
  type ReminderCounts,
  type ReminderList,
  type ReminderView,
  type SmartListId,
} from "@/features/reminders/domain/reminder";
import { NameColorDialog, type NameColorDialogText } from "@/components/name-color-dialog";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR_HEX } from "@/shared/palette/accent-colors";

const SMART_TILES: readonly {
  readonly id: SmartListId;
  readonly icon: LucideIcon;
  readonly color: string;
}[] = [
  { id: "bugun", icon: CalendarDays, color: ACCENT_COLOR_HEX.blue },
  { id: "planlanan", icon: CalendarRange, color: ACCENT_COLOR_HEX.red },
  { id: "tumu", icon: Inbox, color: "#5B626A" },
  { id: "bayrakli", icon: Flag, color: ACCENT_COLOR_HEX.orange },
  { id: "tamamlanan", icon: Check, color: ACCENT_COLOR_HEX.gray },
];

export function smartListColor(id: SmartListId): string {
  return SMART_TILES.find((tile) => tile.id === id)?.color ?? ACCENT_COLOR_HEX.blue;
}

const LIST_DIALOG_TEXT: NameColorDialogText = {
  createTitle: "Yeni Liste",
  editTitle: "Listeyi Düzenle",
  nameLabel: "Liste adı",
  namePlaceholder: "ör. Yem ve malzeme",
  colorLabel: "Liste rengi",
  deleteWarning: "Bu liste, içindeki tüm anımsatıcılarla birlikte kalıcı olarak silinecek.",
};

function smartCount(id: SmartListId, counts: ReminderCounts): number | null {
  switch (id) {
    case "bugun":
      return counts.today;
    case "planlanan":
      return counts.scheduled;
    case "tumu":
      return counts.all;
    case "bayrakli":
      return counts.flagged;
    case "tamamlanan":
      return null;
  }
}

export function RemindersSidebar({
  lists,
  counts,
  view,
}: {
  lists: readonly ReminderList[];
  counts: ReminderCounts;
  view: ReminderView;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ReminderList | null>(null);

  return (
    <nav aria-label="Anımsatıcı listeleri" className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2">
        {SMART_TILES.map(({ id, icon: Icon, color }) => {
          const selected = view.kind === "smart" && view.id === id;
          const count = smartCount(id, counts);
          return (
            <li key={id}>
              <Link
                href={`/animsaticilar?liste=${id}`}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl p-2.5 outline-none",
                  "transition-transform duration-100 ease-out active:scale-[0.97]",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "text-white" : "bg-muted/70 hover:bg-muted",
                )}
                style={selected ? { backgroundColor: color } : undefined}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full",
                      selected ? "bg-white" : "text-white",
                    )}
                    style={selected ? { color } : { backgroundColor: color }}
                  >
                    <Icon aria-hidden className="size-4" strokeWidth={2.5} />
                  </span>
                  {count !== null ? (
                    <span className="text-xl leading-none font-bold tabular-nums">{count}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-[0.8rem] font-semibold",
                    selected ? "text-white/90" : "text-muted-foreground",
                  )}
                >
                  {SMART_LIST_LABELS[id]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div>
        <h3 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Listelerim</h3>
        <ul className="flex flex-col">
          {lists.map((list) => {
            const selected = view.kind === "list" && view.id === list.id;
            return (
              <li key={list.id} className="group/list relative">
                <Link
                  href={`/animsaticilar?liste=${list.id}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 pr-9 text-sm outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "bg-muted font-medium" : "hover:bg-muted/60",
                  )}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: ACCENT_COLOR_HEX[list.color] }}
                  >
                    <List aria-hidden className="size-3.5" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{list.name}</span>
                  <span className="text-muted-foreground tabular-nums group-hover/list:invisible group-focus-within/list:invisible pointer-coarse:invisible">
                    {counts.byList[list.id] ?? 0}
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label={`${list.name} listesini düzenle`}
                  onClick={() => setEditing(list)}
                  className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/list:opacity-100 pointer-coarse:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-6 items-center justify-center">
            <Plus aria-hidden className="size-4" />
          </span>
          Liste Ekle
        </button>
      </div>

      <NameColorDialog
        open={creating}
        onOpenChange={setCreating}
        text={LIST_DIALOG_TEXT}
        onSave={async (value) => {
          const result = await createReminderListAction(value);
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          router.push(`/animsaticilar?liste=${result.value.id}`);
          return true;
        }}
      />
      <NameColorDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initial={editing ? { name: editing.name, color: editing.color } : undefined}
        text={LIST_DIALOG_TEXT}
        onSave={async (value) => {
          if (!editing) return false;
          const result = await updateReminderListAction({ id: editing.id, ...value });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          router.refresh();
          return true;
        }}
        onDelete={async () => {
          if (!editing) return false;
          const result = await deleteReminderListAction({ id: editing.id });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success("Liste silindi.");
          router.push("/animsaticilar");
          return true;
        }}
      />
    </nav>
  );
}
