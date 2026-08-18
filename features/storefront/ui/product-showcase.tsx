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
import { MapPinIcon, PlusIcon, TruckIcon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { env } from "@/shared/env";
import { formatTRY } from "@/shared/utils/money";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import {
  DELIVERY_ONLY_BADGE,
  SHIPPING_BADGE,
} from "@/features/storefront/domain/storefront.config";
import { useCart } from "@/features/storefront/ui/cart-provider";
import {
  fromPriceMinor,
  halfUnitPriceMinor,
  hasHalfUnitOption,
  hasVolumeDiscount,
} from "@/features/storefront/ui/line-pricing";
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
          // items-stretch (not items-start): every slide's <article> gets
          // the height of the tallest one currently laid out in the row —
          // see ShowcaseCaption for why that's what actually fixes the
          // "some buttons sit higher than others" misalignment, not just
          // moves it around.
          className="shop-vitrine-track relative flex flex-1 items-stretch snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth lg:gap-0"
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
      // flex flex-col below lg: the article now has the row's stretched
      // height (from items-stretch on the track above), and stacking its own
      // two children in a column is what lets ShowcaseCaption claim the
      // leftover space and push its button to a shared bottom edge. Inert at
      // lg+ (lg:grid takes over display) — this is a below-lg-only fix,
      // matching the below-lg-only peeking-neighbor layout it repairs.
      className="flex flex-col w-[86%] shrink-0 snap-center sm:w-[88%] lg:grid lg:w-full lg:grid-cols-[minmax(0,1.9fr)_minmax(210px,0.85fr)] lg:items-end lg:gap-8"
    >
      <div
        data-enter
        style={style}
        className="relative aspect-[4/3] shrink-0 overflow-hidden rounded-2xl bg-secondary/50"
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

/**
 * Name, price and the buy control — a deterministic top-down stack, not a
 * bottom-aligned flex row.
 *
 * That used to be `flex items-end`, which bottom-aligns the name/price block
 * against the button. A longer unit label ("Kavanoz (930gr)" vs "kg") wraps
 * the price to a second line, growing the block — and with the bottom edges
 * pinned together, the TITLE'S top edge is what moves to absorb the
 * difference. Stacking top-down fixed that WITHIN one caption (the title is
 * always the first thing after the photo), but every product's caption is
 * still exactly as tall as its own content — a product with no "yarım kilo"
 * line, a shorter name, or a shorter fulfilment badge ends up with a plainly
 * SHORTER caption than its neighbour. On mobile, where slides peek in from
 * both edges and sit side by side, that reads as "some Sepete ekle buttons
 * sit higher than others" — which is exactly the bug, not a rendering fluke.
 *
 * The actual fix is above this component: the track stretches every slide
 * to the tallest one's height, and this caption is flex-1 flex-col so it
 * claims that leftover space and pushes its button (mt-auto) down to a
 * shared bottom edge — regardless of which lines above it happen to be
 * present or how they wrap. Nothing here needs to special-case any one
 * line's height for this to keep working.
 */
function ShowcaseCaption({ product }: { product: Product }) {
  const { getQuantity, addItem } = useCart();
  const qty = getQuantity(product.key);

  return (
    <div
      data-enter
      style={{ "--enter-delay": "190ms" } as React.CSSProperties}
      className="mt-5 flex flex-1 flex-col lg:mt-0 lg:pb-1"
    >
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
      {hasHalfUnitOption(product) ? (
        <p className="mt-1 text-xs text-muted-foreground">
          yarım kilo{" "}
          <span className="text-foreground tabular-nums">
            {formatTRY(halfUnitPriceMinor(product))}
          </span>
        </p>
      ) : null}

      {/* Same fulfilment pill as ProductCard — the vitrine is the first thing
          a shopper sees, so a delivery-only product needs this warning here
          too, not just further down in the grid. */}
      {product.fulfillment_type === "shipping" ? (
        <p className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
          <TruckIcon className="size-3.5 shrink-0" aria-hidden /> {SHIPPING_BADGE}
        </p>
      ) : (
        <p className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          <MapPinIcon className="size-3.5 shrink-0" aria-hidden />{" "}
          {DELIVERY_ONLY_BADGE}
        </p>
      )}

      {/* mt-auto: pushes to the shared bottom edge the now-equal-height
          caption provides, with pt-4 as the floor so the tallest slide in
          the row (zero slack to absorb) still keeps its normal gap. lg+
          reverts to the original fixed mt-6 — desktop shows one slide at a
          time, so there's nothing to align against and no bug to fix. */}
      <div className="mt-auto pt-4 lg:mt-6 lg:pt-0">
        {qty > 0 ? (
          <QuantityStepper product={product} />
        ) : (
          <Button
            type="button"
            size="lg"
            className="h-11 w-full rounded-full sm:w-auto sm:px-6"
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
