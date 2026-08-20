"use client";

import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  decrementQuantity,
  incrementQuantity,
} from "@/features/storefront/domain/cart";
import { Button } from "@/components/ui/button";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { hasHalfUnitOption } from "@/features/storefront/ui/line-pricing";

import type { Product } from "@/features/products/application/list-products";

/**
 * "0,5" alone doesn't say what's being weighed out. For half-unit products
 * (see hasHalfUnitOption) that suffix is "kg" — this codebase's half-unit
 * increment is always half a kilogram, never half a jar or half a package.
 */
function formatQty(product: Product, quantity: number): string {
  const formatted = quantity.toLocaleString("tr-TR", {
    maximumFractionDigits: 2,
  });
  return hasHalfUnitOption(product) ? `${formatted}kg` : formatted;
}

/** +/- stepper bound to a cart line. Stepping below the product minimum
 *  removes the line. Honours the product's step (0.5 kg for cheese/yogurt). */
export function QuantityStepper({ product }: { product: Product }) {
  const { getQuantity, setQuantity, removeItem } = useCart();
  const qty = getQuantity(product.key);
  const atMin = qty <= product.min_qty;

  const handleDecrement = () => {
    if (atMin) {
      removeItem(product.key);
      return;
    }
    setQuantity(product.key, decrementQuantity(qty, product.min_qty, product.step));
  };

  const handleIncrement = () => {
    setQuantity(product.key, incrementQuantity(qty, product.step));
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-background p-1">
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        className="size-11 shrink-0 rounded-full"
        onClick={handleDecrement}
        aria-label={atMin ? "Ürünü çıkar" : "Azalt"}
      >
        {atMin ? <Trash2Icon /> : <MinusIcon />}
      </Button>
      <span className="min-w-13 text-center text-base font-medium tabular-nums">
        {formatQty(product, qty)}
      </span>
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        className="size-11 shrink-0 rounded-full"
        onClick={handleIncrement}
        aria-label="Artır"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
