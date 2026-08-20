"use client";

/**
 * Lokasyonları Yönet — add/deactivate/delete market stall locations, right
 * on the Pazar Satışları page rather than buried inside the sale form's
 * quick-add. A location with recorded sales can't be hard-deleted (FK
 * restrict, see market-location.repository.ts) — deleteMarketLocationAction
 * surfaces that as a CONFLICT, and this UI responds by pointing at the
 * "Pasife al" switch instead (matches the products archive-not-delete
 * convention).
 */
import { Loader2, MapPin, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createMarketLocationAction,
  deleteMarketLocationAction,
  setMarketLocationActiveAction,
} from "@/features/finance/application/market-location-actions";
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
import { Switch } from "@/components/ui/switch";

import type { MarketLocation } from "@/features/finance/domain/market-location";

export function MarketLocationManager({
  locations,
}: {
  locations: readonly MarketLocation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const addLocation = () => {
    const name = newName.trim();
    if (name === "") return;
    startPending(async () => {
      const result = await createMarketLocationAction({ name });
      if (result.ok) {
        toast.success(`${result.value.name} eklendi.`);
        setNewName("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const toggleActive = (location: MarketLocation) => {
    startPending(async () => {
      const result = await setMarketLocationActiveAction({
        id: location.id,
        active: !location.active,
      });
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const confirmDelete = (id: string) => {
    startPending(async () => {
      const result = await deleteMarketLocationAction({ id });
      if (result.ok) {
        toast.success("Lokasyon silindi.");
        setConfirmDeleteId(null);
        router.refresh();
      } else {
        // CONFLICT — location has recorded sales. Message already explains
        // "pasife alabilirsiniz"; no need to duplicate it in a second toast.
        toast.error(result.error.message);
        setConfirmDeleteId(null);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Lokasyonları Yönet
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pazar Lokasyonları</DialogTitle>
          <DialogDescription>
            Pasif lokasyonlar yeni satış eklerken seçilemez, ama geçmiş
            satışları korunur. Satışı olan bir lokasyon silinemez — bunun
            yerine pasife alın.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {locations.map((location) => (
            <li
              key={location.id}
              className="flex items-center gap-2.5 rounded-lg border p-2.5"
            >
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {location.name}
              </span>
              {!location.active ? (
                <Badge variant="secondary">Pasif</Badge>
              ) : null}
              <Switch
                checked={location.active}
                onCheckedChange={() => toggleActive(location)}
                disabled={pending}
                aria-label={location.active ? "Pasife al" : "Aktif et"}
              />
              {confirmDeleteId === location.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => confirmDelete(location.id)}
                    className="gap-1"
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Sil
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Vazgeç
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  aria-label="Sil"
                  onClick={() => setConfirmDeleteId(location.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
          {locations.length === 0 ? (
            <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Henüz lokasyon yok.
            </li>
          ) : null}
        </ul>

        <div className="flex gap-2 border-t pt-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Yeni lokasyon adı"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLocation();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || newName.trim() === ""}
            onClick={addLocation}
          >
            Ekle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
