import { NotFoundCard } from "@/features/storefront/ui/not-found-card";

/**
 * 404 for a `notFound()` thrown by a shop page (e.g. an unknown legal slug).
 * Renders inside the shop layout, so the header, the tab bar and the basket
 * are all still there. An address that matches no route at all is handled by
 * app/not-found.tsx instead.
 */
export default function ShopNotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <NotFoundCard />
    </main>
  );
}
