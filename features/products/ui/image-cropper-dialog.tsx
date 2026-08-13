"use client";

/**
 * Pan/zoom cropper shown right after a file is picked, before it's uploaded.
 * Both the admin dropzone and the storefront product card render the cover
 * image at `aspect-[5/4] object-cover` — this crops to that same ratio, so
 * what the admin frames here is what a customer actually sees, not whatever
 * `object-cover` happens to cut off on its own.
 *
 * Hand-rolled rather than a dependency: drag-to-pan + a zoom slider is the
 * whole feature, and canvas + pointer events cover it without pulling in a
 * cropper library for one screen.
 */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ASPECT_W = 5;
const ASPECT_H = 4;
const VIEWPORT_W = 320; // CSS px shown in the dialog
const VIEWPORT_H = (VIEWPORT_W * ASPECT_H) / ASPECT_W;
const OUTPUT_W = 1200; // px written to the exported image
const OUTPUT_H = (OUTPUT_W * ASPECT_H) / ASPECT_W;
const MAX_ZOOM = 3;

interface ImageCropperDialogProps {
  /** The just-picked file, or null when the dialog should be closed. */
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

export function ImageCropperDialog({
  file,
  onCancel,
  onConfirm,
}: ImageCropperDialogProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Load the picked file and compute the "cover" scale — the smallest zoom
  // at which the image still fills the viewport with no gaps, same idea as
  // CSS object-fit: cover.
  useEffect(() => {
    // No setState here for the "no file" case — the dialog is closed
    // whenever `file` is null (`open={file !== null}`), so a stale `image`
    // from the previous file is never visible; it's simply overwritten the
    // next time this effect runs for a real file.
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.max(
        VIEWPORT_W / img.naturalWidth,
        VIEWPORT_H / img.naturalHeight,
      );
      setBaseScale(scale);
      setZoom(1);
      setOffset({
        x: (VIEWPORT_W - img.naturalWidth * scale) / 2,
        y: (VIEWPORT_H - img.naturalHeight * scale) / 2,
      });
      setImage(img);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scale = baseScale * zoom;

  function clampOffset(x: number, y: number, s: number) {
    if (!image) return { x, y };
    const w = image.naturalWidth * s;
    const h = image.naturalHeight * s;
    // The image is always at least viewport-sized (scale ≥ cover scale), so
    // these mins are ≤ 0 — the frame can never show empty space at an edge.
    const minX = Math.min(0, VIEWPORT_W - w);
    const minY = Math.min(0, VIEWPORT_H - h);
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  }

  function onZoomChange(nextZoom: number) {
    // Re-clamp immediately, in the same event, so the frame can't drift off
    // the image edge as it shrinks toward `nextZoom`.
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, baseScale * nextZoom));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(
      clampOffset(dragRef.current.originX + dx, dragRef.current.originY + dy, scale),
    );
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function confirm() {
    if (!image) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }
    // Same transform as the on-screen preview (translate then scale, from
    // the viewport's top-left), just uniformly scaled up to output resolution.
    const k = OUTPUT_W / VIEWPORT_W;
    ctx.save();
    ctx.scale(k, k);
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.85),
    );
    setSaving(false);
    if (blob) onConfirm(blob);
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Görseli konumlandır</DialogTitle>
          <DialogDescription>
            Sürükleyerek kaydırın, kaydırıcıyla yakınlaştırın.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto touch-none overflow-hidden rounded-lg bg-muted select-none"
          style={{ width: VIEWPORT_W, height: VIEWPORT_H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {image ? (
            // A local blob preview, not an optimizable remote asset — plain
            // <img> rather than next/image is the right tool here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-0 left-0 origin-top-left"
              style={{
                width: image.naturalWidth,
                height: image.naturalHeight,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-muted-foreground">Yakınlaştır</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="w-full accent-primary"
            disabled={!image}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Vazgeç
          </Button>
          <Button type="button" onClick={confirm} disabled={!image || saving}>
            {saving ? "Kaydediliyor…" : "Kullan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
