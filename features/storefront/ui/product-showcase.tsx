"use client";

/**
 * The storefront vitrine — the shop window above the catalog.
 *
 * Every product photograph in this shop is the same gesture: a hand holding the
 * harvest out in the orchard. That is the farm's real visual signature, and a
 * 300px grid tile destroys it. So the top of the home page is one large stage
 * photograph at a time, with the remaining products shown as photographs beside
 * it — the products themselves are the navigation, which is why there are no
 * dots and no arrows.
 *
 * Transport is CSS scroll-snap, not a carousel library: swipe works natively on
 * touch, the rail buttons drive `scrollTo` on desktop, and nothing animates on
 * its own. Each slide carries its own caption, so the only React state is which
 * rail thumbnail reads as current — a mis-synced caption is impossible.
 */
import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { env } from "@/shared/env";
import { formatTRY } from "@/shared/utils/money";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import { useCart } from "@/features/storefront/ui/cart-provider";
import { fromPriceMinor, hasVolumeDiscount } from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

import type { Product } from "@/features/products/application/list-products";

/**
 * How many products the window displays. A shop window shows a selection, not
 * the stock room — and the rail has to stay the height of the stage. Everything
 * remains buyable from the collection below.
 */
const VITRINE_LIMIT = 5;

export function ProductShowcase({ products }: { products: readonly Product[] }) {
  const items = products.slice(0, VITRINE_LIMIT);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  // Which slide is on stage, read from the scroll position rather than tracked
  // by hand — a swipe and a rail click then agree by construction.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = slideRefs.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive(index);
        }
      },
      { root: track, threshold: 0.6 },
    );

    for (const slide of slideRefs.current) {
      if (slide) observer.observe(slide);
    }
    return () => observer.disconnect();
  }, [items.length]);

  if (items.length === 0) return null;

  const show = (index: number) => {
    const track = trackRef.current;
    const slide = slideRefs.current[index];
    if (!track || !slide) return;
    // scrollTo on the track, not scrollIntoView: the latter also scrolls the
    // page vertically to reach the slide.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: slide.offsetLeft, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <section aria-label="Vitrin" className="shop-vitrine">
      <div className="flex items-start gap-5 lg:gap-7">
        <div
          ref={trackRef}
          // `relative` is load-bearing: it makes the track each slide's
          // offsetParent, so `offsetLeft` below is the offset *within* the
          // track — the number scrollTo wants. Without it the value carries the
          // track's own page position and only snapping hides the error.
          className="shop-vitrine-track relative flex flex-1 snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth lg:gap-0"
        >
          {items.map((product, index) => (
            <ShowcaseSlide
              key={product.key}
              product={product}
              priority={index === 0}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
              style={{ "--enter-delay": "90ms" } as React.CSSProperties}
            />
          ))}
        </div>

        {/* The window shelf. Photographs, not dots — on mobile the next slide
            peeks in from the edge instead, which needs no controls at all. */}
        {items.length > 1 ? (
          <div className="hidden shrink-0 flex-col gap-3 lg:flex">
            {items.map((product, index) => (
              <RailThumb
                key={product.key}
                product={product}
                current={index === active}
                onSelect={() => show(index)}
                // Last frame starts at 440ms and the 760ms curve ends at
                // ~1.2s — the whole window is assembled, then it stays still.
                style={{ "--enter-delay": `${260 + index * 45}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** One product on stage: photograph, then its caption line beneath. */
function ShowcaseSlide({
  product,
  priority,
  ref,
  style,
}: {
  product: Product;
  priority: boolean;
  ref: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
}) {
  const imageUrl = productImagePublicUrl(
    product.image_path,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  return (
    // Photo and label sit side by side from lg up — the source photographs are
    // 5:4, so the stage keeps a 4:3 frame rather than stretching to the full
    // column width and cropping the hands and sky out of every shot.
    <article
      ref={ref}
      aria-label={product.display_name}
      // The peek is what says "there is more" below lg, so it stays a sliver:
      // any wider and the next product starts competing with the one on stage.
      className="w-[86%] shrink-0 snap-center sm:w-[88%] lg:grid lg:w-full lg:grid-cols-[minmax(0,1.9fr)_minmax(210px,0.85fr)] lg:items-end lg:gap-8"
    >
      <div
        data-enter
        style={style}
        className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-secondary/50"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.image_alt ?? product.display_name}
            fill
            priority={priority}
            sizes="(max-width: 639px) 86vw, (max-width: 1023px) 88vw, 700px"
            className="object-cover object-center"
          />
        ) : (
          <span
            className="flex h-full items-center justify-center text-7xl"
            aria-hidden
          >
            {productEmoji(product.key)}
          </span>
        )}
      </div>

      <ShowcaseCaption product={product} />
    </article>
  );
}

/** Name, price and the buy control on one baseline — an exhibit label. */
function ShowcaseCaption({ product }: { product: Product }) {
  const { getQuantity, addItem } = useCart();
  const qty = getQuantity(product.key);

  return (
    <div
      data-enter
      style={{ "--enter-delay": "190ms" } as React.CSSProperties}
      className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 lg:mt-0 lg:block lg:pb-1"
    >
      <div className="min-w-0">
        <h2 className="font-display text-[clamp(1.5rem,2.6vw,2.1rem)] leading-[1.1] tracking-[-0.02em] text-balance text-foreground">
          {product.display_name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasVolumeDiscount(product) ? "başlangıç " : ""}
          <span className="text-base text-foreground tabular-nums">
            {formatTRY(fromPriceMinor(product))}
          </span>{" "}
          / {product.unit_label}
        </p>
      </div>

      <div className="lg:mt-6">
        {qty > 0 ? (
          <QuantityStepper product={product} />
        ) : (
          <Button
            type="button"
            size="lg"
            className="h-11 rounded-full px-6"
            onClick={() => addItem(product.key, product.min_qty)}
          >
            <PlusIcon /> Sepete ekle
          </Button>
        )}
      </div>
    </div>
  );
}

/** A shelf frame. Marked with `aria-current` rather than a label of its own, so
 *  the control carries no copy beyond the product's own name. */
function RailThumb({
  product,
  current,
  onSelect,
  style,
}: {
  product: Product;
  current: boolean;
  onSelect: () => void;
  style?: React.CSSProperties;
}) {
  const imageUrl = productImagePublicUrl(
    product.image_path,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      data-enter
      style={style}
      aria-label={product.display_name}
      {...(current ? { "aria-current": true as const } : {})}
      className={cn(
        // 88px × 5 frames + gaps ≈ the stage's height, so the shelf ends where
        // the photograph does.
        "relative size-[88px] shrink-0 overflow-hidden rounded-lg bg-secondary/50 transition-[opacity,transform] duration-300 ease-out outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        current
          ? "opacity-100"
          : "opacity-55 hover:opacity-85 focus-visible:opacity-100",
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="88px"
          className="object-cover object-center"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-3xl" aria-hidden>
          {productEmoji(product.key)}
        </span>
      )}
      {/* The current frame is marked on the glass, not with a dot below it. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-2 bottom-2 h-px origin-left bg-foreground/70 transition-transform duration-300 ease-out",
          current ? "scale-x-100" : "scale-x-0",
        )}
      />
    </button>
  );
}
