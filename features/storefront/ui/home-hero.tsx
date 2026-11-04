"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  showcaseImageSrc,
  type ShowcaseSlide,
} from "@/features/storefront/domain/showcase";
import { HomeHeroIntroMarker } from "@/features/storefront/ui/home-hero-intro-marker";
import { env } from "@/shared/env";

/**
 * The home page's showcase (vitrin): the farm photographs the owner picks in
 * the admin "Vitrin" page (/vitrin), sliding past under the owner's sentence
 * (`heroSubtitle`, edited on the same page). The sentence stays put; only the
 * photos move.
 *
 * Sliding is the browser's own horizontal scroll with snap points, not a
 * scripted animation: the photo follows the finger 1:1, a flick carries its
 * momentum to the next photo, and a slide can be caught and reversed
 * mid-way — all of which native scrolling already does better than a
 * hand-rolled gesture. The arrows and dots only ask the scroller to move.
 *
 * Nothing advances on its own. A photo that changes while someone is reading
 * the sentence takes the choice away from them, and the arrows are always
 * visible, so nobody has to discover the swipe.
 *
 * The first photo keeps the shop's one staged moment: on the first visit of a
 * session it settles into place (`.shop-hero-media` in theme.css; the "already
 * seen" check is an inline script in the shop layout, `HOME_INTRO_SKIP_SCRIPT`,
 * and the marker below records the visit). With "reduce motion" on, that
 * entrance never plays and the arrows jump instead of gliding.
 *
 * Each photo is a site file or an uploaded file in the public bucket
 * (`showcaseImageSrc`); `focusY` keeps the chosen part of it in frame at every
 * crop.
 */

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeHero({
  slides,
  subtitle,
  className,
}: {
  slides: readonly ShowcaseSlide[];
  subtitle: string;
  className?: string | undefined;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const last = slides.length - 1;

  // The dots follow the scroll position, so a swipe, a trackpad flick and an
  // arrow press all update them the same way. One read per frame at most.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = scroller.clientWidth;
        if (width > 0) setIndex(Math.round(scroller.scrollLeft / width));
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const clamped = Math.min(Math.max(target, 0), last);
      scroller.scrollTo({
        left: clamped * scroller.clientWidth,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
    [last],
  );

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Çiftlikten fotoğraflar"
      className={cn(
        "relative aspect-[16/10] overflow-hidden rounded-3xl bg-secondary shadow-(--shop-shadow-sm) sm:aspect-[5/2] lg:aspect-[7/2]",
        className,
      )}
    >
      <div
        ref={scrollerRef}
        // Focusable so the keyboard's arrow keys scroll it too.
        tabIndex={0}
        aria-label="Fotoğraflar"
        className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${slides.length}`}
            className="relative size-full shrink-0 snap-start snap-always"
          >
            <Image
              src={showcaseImageSrc(slide.imagePath, env.NEXT_PUBLIC_SUPABASE_URL)}
              alt={slide.imageAlt}
              fill
              priority={i === 0}
              sizes="(max-width: 1152px) 100vw, 1152px"
              className={cn("object-cover", i === 0 && "shop-hero-media")}
              style={{ objectPosition: `50% ${slide.focusY}%` }}
            />
          </div>
        ))}
      </div>

      {/* The sentence and the controls float above the photos. The layer
          itself lets touches through, so a swipe that starts on the text
          still moves the photos; only the buttons catch presses.

          The shade under the text has to hold up over the brightest photo
          (the white tablecloth). On a phone the text spans the width, so it
          is shaded from the bottom; on wider screens the text sits in the
          left half, so a left-to-right shade is added and the right of the
          photo stays clear. Checked on the live site, 2026-10-26. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-[linear-gradient(to_top,rgb(0_0_0/0.72),rgb(0_0_0/0.42)_45%,transparent_85%)] p-4 sm:bg-[linear-gradient(to_top,rgb(0_0_0/0.6),transparent_70%),linear-gradient(to_right,rgb(0_0_0/0.6),rgb(0_0_0/0.3)_45%,transparent_70%)] sm:p-6 lg:p-8">
        <p className="max-w-xl text-[0.9375rem] leading-snug font-medium text-pretty text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.45)] sm:text-lg lg:text-xl lg:leading-relaxed">
          {subtitle}
        </p>
        {/* One photo has nowhere to slide to. */}
        {slides.length > 1 ? (
          <div className="mt-3 flex items-center justify-between sm:mt-4">
            <div className="pointer-events-auto flex items-center gap-1">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`${i + 1}. fotoğraf`}
                  aria-current={i === index || undefined}
                  // The visible dot is small; the button around it is a full
                  // finger's width.
                  className="group grid size-6 place-items-center"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full bg-white transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none",
                      i === index ? "w-5 opacity-100" : "w-1.5 opacity-55 group-hover:opacity-80",
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="pointer-events-auto flex gap-2">
              <ShowcaseArrow
                label="Önceki fotoğraf"
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
              >
                <ChevronLeftIcon className="size-5" aria-hidden />
              </ShowcaseArrow>
              <ShowcaseArrow
                label="Sonraki fotoğraf"
                disabled={index === last}
                onClick={() => goTo(index + 1)}
              >
                <ChevronRightIcon className="size-5" aria-hidden />
              </ShowcaseArrow>
            </div>
          </div>
        ) : null}
      </div>

      <HomeHeroIntroMarker />
    </section>
  );
}

/** A frosted round button: light glass over the photo, pressed on touch-down. */
function ShowcaseArrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-md transition-[transform,opacity] duration-100 ease-out ring-inset active:scale-[0.94] disabled:opacity-35 disabled:active:scale-100 sm:size-11"
    >
      {children}
    </button>
  );
}
