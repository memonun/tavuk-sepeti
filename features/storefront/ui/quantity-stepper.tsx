"use client";

import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  decrementQuantity,
  incrementQuantity,
} from "@/features/storefront/domain/cart";
import { Button } from "@/components/ui/button";

import { useCart } from "@/features/storefront/ui/cart-provider";

import type { Product } from "@/features/products/application/list-products";

function formatQty(quantity: number): string {
  return quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
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
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        onClick={handleDecrement}
        aria-label={atMin ? "Ürünü çıkar" : "Azalt"}
      >
        {atMin ? <Trash2Icon /> : <MinusIcon />}
      </Button>
      <span className="min-w-10 text-center text-sm font-medium tabular-nums">
        {formatQty(qty)}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        onClick={handleIncrement}
        aria-label="Artır"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
