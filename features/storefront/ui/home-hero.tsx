import Image from "next/image";

import { cn } from "@/lib/utils";

import { HomeHeroIntroMarker } from "@/features/storefront/ui/home-hero-intro-marker";

/**
 * The home page's opening picture — a short band, not a full-screen hero, so
 * the products still start on the first screen.
 *
 * It is the one staged moment in the shop: on the first visit of a session
 * the picture settles into place (a half-second fade and a 4% ease back to
 * size — see `.shop-hero-media` in theme.css). It covers nothing and blocks
 * nothing; the customer can scroll and shop while it plays. It does not
 * replay when they come back to the home page, and with "reduce motion" on it
 * never plays at all. The "already seen" check is an inline script in the
 * shop layout (`HOME_INTRO_SKIP_SCRIPT`); the marker below records the visit.
 *
 * The frame is cropped tighter than the photograph on phones and tablets;
 * the table with the two chalkboards sits in the lower-middle of the picture
 * (roughly 40–80% of its height), so the crop is anchored at 72% to keep it
 * in view at every width.
 *
 * Referenced by URL, not as a static import: the `*.webp` module types come
 * from the generated (git-ignored) next-env.d.ts, which does not exist when
 * CI runs `tsc` without a build. The frame's own kraft background stands in
 * until the picture arrives.
 */
export function HomeHero({ className }: { className?: string | undefined }) {
  return (
    <div
      className={cn(
        "relative aspect-[9/4] overflow-hidden rounded-3xl bg-secondary shadow-(--shop-shadow-sm) sm:aspect-[5/2] lg:aspect-[3/2]",
        className,
      )}
    >
      <Image
        src="/brand/apuhan-acilis-masa.webp"
        alt="Bahçede, Apuhan Çiftliği kara tahtası önünde kuru kayısı, badem ve dut dolu masa"
        fill
        priority
        sizes="(max-width: 1023px) 100vw, 480px"
        className="shop-hero-media object-cover object-[50%_72%]"
      />
      <HomeHeroIntroMarker />
    </div>
  );
}
