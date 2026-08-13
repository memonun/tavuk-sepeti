"use client";

/**
 * Small copy-to-clipboard button. Swaps its own label to a checkmark for a
 * moment as feedback — no toast dependency, since not every layout that
 * needs this (the storefront, in particular) mounts a `<Toaster/>`.
 */
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** The exact text written to the clipboard. */
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "Kopyala", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context) — the
      // value is still visible on screen, so failing silently is fine.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={cn("shrink-0 gap-1", className)}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {copied ? "Kopyalandı" : label}
    </Button>
  );
}
