"use client";

/**
 * One Google Maps script load for an address editor.
 *
 * `<AddressAutocomplete>` and `<AddressPinCorrector>` both need an
 * `<APIProvider>` ancestor. Lifting it here means the two share a single script
 * load and a single billing session per form — the admin customer form already
 * did this inline; the storefront needs the same, so it moved into a component
 * both can reach (`ui-primitive` is the only layer importable from every
 * feature's ui/ under the ESLint boundaries config).
 *
 * When the browser key is missing the children are not rendered at all — an
 * `<APIProvider>` with no key throws at runtime, and a blank map is a worse
 * failure than an explicit message. The `fallback` slot lets the caller degrade
 * to plain inputs.
 */
import { APIProvider } from "@vis.gl/react-google-maps";

interface AddressMapsProviderProps {
  apiKey: string | undefined;
  children: React.ReactNode;
  /** Rendered instead of `children` when no browser key is configured. */
  fallback?: React.ReactNode;
}

export function AddressMapsProvider({
  apiKey,
  children,
  fallback,
}: AddressMapsProviderProps) {
  if (!apiKey) {
    return (
      <>
        {fallback ?? (
          <p className="rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-700 dark:text-orange-300">
            Harita yapılandırılmamış (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY eksik).
          </p>
        )}
      </>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places", "marker"]}>
      {children}
    </APIProvider>
  );
}
