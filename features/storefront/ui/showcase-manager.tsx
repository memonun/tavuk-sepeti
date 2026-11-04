"use client";

/**
 * Admin "Vitrin" photos: the list in showcase order, each with its framing
 * and description, plus a card to add a new photo.
 *
 * The showcase is cropped differently per screen (16:10 on a phone, 7:2 on a
 * computer), so every photo is previewed in both frames, and the "which part
 * shows" slider moves both previews as it is dragged — the admin sees what a
 * customer will see before saving.
 */
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImagePlusIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addShowcaseSlideAction,
  removeShowcaseSlideAction,
  reorderShowcaseSlidesAction,
  updateShowcaseSlideAction,
} from "@/features/storefront/application/showcase-actions";
import {
  MAX_SHOWCASE_ALT_LENGTH,
  MAX_SHOWCASE_SLIDES,
  moveSlide,
  showcaseImageSrc,
  type ShowcaseSlide,
} from "@/features/storefront/domain/showcase";
import { downscaleImage } from "@/features/storefront/ui/downscale-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { env } from "@/shared/env";
import { isAllowedUploadImageType } from "@/shared/utils/image-upload";

export function ShowcaseManager({ slides }: { slides: readonly ShowcaseSlide[] }) {
  const [reordering, startReorder] = useTransition();
  const ids = slides.map((slide) => slide.id);

  const move = (id: string, direction: -1 | 1) => {
    startReorder(async () => {
      const result = await reorderShowcaseSlidesAction({ ids: moveSlide(ids, id, direction) });
      if (!result.ok) toast.error(result.error.message);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {slides.map((slide, i) => (
          <li key={slide.id}>
            <SlideCard
              slide={slide}
              position={i + 1}
              total={slides.length}
              reordering={reordering}
              onMove={(direction) => move(slide.id, direction)}
            />
          </li>
        ))}
      </ol>
      {slides.length < MAX_SHOWCASE_SLIDES ? (
        <AddSlideCard />
      ) : (
        <p className="text-sm text-muted-foreground">
          Vitrinde en fazla {MAX_SHOWCASE_SLIDES} fotoğraf olabilir. Yenisini eklemek için birini
          kaldırın.
        </p>
      )}
    </div>
  );
}

/** The photo as a phone and as a computer will crop it. */
function CropPreviews({ src, alt, focusY }: { src: string; alt: string; focusY: number }) {
  const frames = [
    { label: "Telefon", className: "aspect-[16/10] w-28 sm:w-32" },
    { label: "Bilgisayar", className: "aspect-[7/2] w-44 sm:w-56" },
  ];
  return (
    <div className="flex items-end gap-3">
      {frames.map((frame) => (
        <figure key={frame.label} className="flex flex-col gap-1">
          <div className={`relative overflow-hidden rounded-md bg-muted ${frame.className}`}>
            <Image
              src={src}
              alt={frame.label === "Telefon" ? alt : ""}
              fill
              sizes="224px"
              unoptimized={src.startsWith("blob:")}
              className="object-cover"
              style={{ objectPosition: `50% ${focusY}%` }}
            />
          </div>
          <figcaption className="text-xs text-muted-foreground">{frame.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function FocusSlider({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Fotoğrafın görünen kısmı</Label>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Üst</span>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          disabled={disabled}
          className="w-full accent-primary"
        />
        <span>Alt</span>
      </div>
    </div>
  );
}

function SlideCard({
  slide,
  position,
  total,
  reordering,
  onMove,
}: {
  slide: ShowcaseSlide;
  position: number;
  total: number;
  reordering: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const [alt, setAlt] = useState(slide.imageAlt);
  const [focusY, setFocusY] = useState(slide.focusY);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startPending] = useTransition();
  const src = showcaseImageSrc(slide.imagePath, env.NEXT_PUBLIC_SUPABASE_URL);
  const altValid = alt.trim().length > 0 && alt.trim().length <= MAX_SHOWCASE_ALT_LENGTH;
  const changed = alt.trim() !== slide.imageAlt || focusY !== slide.focusY;
  const busy = pending || reordering;

  const save = () => {
    startPending(async () => {
      const result = await updateShowcaseSlideAction({ id: slide.id, image_alt: alt, focus_y: focusY });
      if (result.ok) toast.success("Fotoğraf güncellendi.");
      else toast.error(result.error.message);
    });
  };

  const remove = () => {
    startPending(async () => {
      const result = await removeShowcaseSlideAction({ id: slide.id });
      if (result.ok) {
        toast.success("Fotoğraf vitrinden kaldırıldı.");
        setDeleteOpen(false);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <CropPreviews src={src} alt={slide.imageAlt} focusY={focusY} />
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {position}/{total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Öne al"
            disabled={busy || position === 1}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Sona al"
            disabled={busy || position === total}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <FocusSlider id={`focus-${slide.id}`} value={focusY} onChange={setFocusY} disabled={busy} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`alt-${slide.id}`}>Fotoğrafta ne var?</Label>
        <Input
          id={`alt-${slide.id}`}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          maxLength={MAX_SHOWCASE_ALT_LENGTH}
          disabled={busy}
          aria-invalid={!altValid || undefined}
        />
        <p className="text-xs text-muted-foreground">
          {altValid
            ? "Görme engelli müşterilere sesli okunur ve Google'da görünür."
            : "Açıklama boş olamaz."}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button onClick={save} disabled={busy || !changed || !altValid} className="gap-1.5">
          {pending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
          Kaydet
        </Button>
        <Button
          variant="ghost"
          className="gap-1.5 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          disabled={busy || total <= 1}
          title={total <= 1 ? "Vitrinde en az bir fotoğraf kalmalı." : undefined}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
          Kaldır
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fotoğrafı vitrinden kaldır</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bu fotoğraf ana sayfadaki vitrinden kaldırılacak. Geri almak için yeniden yüklemeniz
            gerekir.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending} className="gap-1.5">
              {pending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
              Kaldır
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddSlideCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  // The picked file and a local object URL to preview it with.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const pickedUrlRef = useRef<string | null>(null);
  const [alt, setAlt] = useState("");
  const [focusY, setFocusY] = useState(50);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startPending] = useTransition();
  const altValid = alt.trim().length > 0 && alt.trim().length <= MAX_SHOWCASE_ALT_LENGTH;

  // An object URL holds the file in memory until it is revoked: release the
  // old one whenever the preview changes, and the last one when the card goes.
  const setPreview = (file: File | null) => {
    if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    pickedUrlRef.current = url;
    setPicked(file && url ? { file, url } : null);
  };
  useEffect(
    () => () => {
      if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
    },
    [],
  );

  const pick = (file: File) => {
    if (!isAllowedUploadImageType(file.type)) {
      toast.error("Yalnızca JPEG, PNG veya WEBP yükleyin.");
      return;
    }
    setPreview(file);
    setFocusY(50);
  };

  const reset = () => {
    setPreview(null);
    setAlt("");
    setFocusY(50);
  };

  const add = () => {
    if (!picked) return;
    const { file } = picked;
    startPending(async () => {
      let blob: Blob;
      try {
        blob = await downscaleImage(file);
      } catch {
        toast.error("Fotoğraf hazırlanamadı. Başka bir fotoğraf deneyin.");
        return;
      }
      const form = new FormData();
      form.append("file", blob, blob.type === "image/webp" ? "vitrin.webp" : "vitrin.jpg");
      form.append("image_alt", alt);
      form.append("focus_y", String(focusY));
      const result = await addShowcaseSlideAction(form);
      if (result.ok) {
        toast.success("Fotoğraf vitrine eklendi.");
        reset();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <p className="text-sm font-medium">Yeni fotoğraf ekle</p>

      {picked ? (
        <>
          <CropPreviews src={picked.url} alt={alt} focusY={focusY} />
          <FocusSlider id="focus-new" value={focusY} onChange={setFocusY} disabled={pending} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alt-new">Fotoğrafta ne var?</Label>
            <Input
              id="alt-new"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              maxLength={MAX_SHOWCASE_ALT_LENGTH}
              placeholder="Örn. Bahçede eşinen tavuklar"
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Görme engelli müşterilere sesli okunur ve Google&apos;da görünür.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={add} disabled={pending || !altValid} className="gap-1.5">
              {pending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
              Vitrine ekle
            </Button>
            <Button variant="ghost" onClick={reset} disabled={pending}>
              Vazgeç
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const dropped = event.dataTransfer.files[0];
            if (dropped) pick(dropped);
          }}
          className={`flex flex-col items-center gap-1.5 rounded-md border-2 border-dashed px-3 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/40"
          }`}
        >
          <ImagePlusIcon className="h-6 w-6" />
          Fotoğrafı sürükle-bırak veya seç
          <span className="text-xs">JPEG / PNG / WEBP · yatay fotoğraflar en iyi görünür</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) pick(picked);
          event.target.value = "";
        }}
      />
    </div>
  );
}
