"use client";

/**
 * Admin product cover-image control: shows the current image (or an empty
 * drop target) and accepts a file via drag-and-drop or click-to-select. The
 * picked file opens the pan/zoom cropper (`ImageCropperDialog`) so the admin
 * frames the shot before it's set — the crop already downsizes + re-encodes
 * to WEBP, so the result goes straight to the upload server action (which
 * re-validates and stores it). "Kaldır" clears it.
 */
import { ImagePlusIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { removeProductImageAction } from "@/features/products/application/remove-product-image";
import { uploadProductImageAction } from "@/features/products/application/upload-product-image";
import {
  isAllowedProductImageType,
  productImagePublicUrl,
} from "@/features/products/domain/product-image";
import { ImageCropperDialog } from "@/features/products/ui/image-cropper-dialog";
import { env } from "@/shared/env";

export function ProductImageDropzone({
  productKey,
  imagePath,
  imageAlt,
  displayName,
}: {
  productKey: string;
  imagePath: string | null;
  imageAlt: string | null;
  displayName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, startBusy] = useTransition();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const imageUrl = productImagePublicUrl(
    imagePath,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  const handleFile = (file: File) => {
    if (!isAllowedProductImageType(file.type)) {
      toast.error("Yalnızca JPEG, PNG veya WEBP yükleyin.");
      return;
    }
    setPendingFile(file);
  };

  const handleCropped = (blob: Blob) => {
    setPendingFile(null);
    startBusy(async () => {
      const form = new FormData();
      form.append("product_key", productKey);
      form.append("file", blob, "cover.webp");
      const result = await uploadProductImageAction(form);
      if (result.ok) {
        toast.success(`${displayName} görseli güncellendi.`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const remove = () => {
    startBusy(async () => {
      const result = await removeProductImageAction({ product_key: productKey });
      if (result.ok) {
        toast.success("Görsel kaldırıldı.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        disabled={busy}
        aria-label="Ürün görseli yükle"
        className={`relative flex aspect-[5/4] w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 disabled:cursor-not-allowed ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt ?? displayName}
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className="object-cover"
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center text-xs">
            <ImagePlusIcon className="h-6 w-6" />
            Görseli sürükle-bırak veya seç
          </span>
        )}

        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2Icon className="h-5 w-5 animate-spin" />
          </span>
        ) : null}
      </button>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          JPEG / PNG / WEBP · en fazla 5 MB
        </p>
        {imageUrl ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
          >
            <Trash2Icon className="h-3 w-3" />
            Kaldır
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <ImageCropperDialog
        file={pendingFile}
        onCancel={() => setPendingFile(null)}
        onConfirm={handleCropped}
      />
    </div>
  );
}
