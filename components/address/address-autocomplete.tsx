"use client";

/**
 * Google Places autocomplete for structured Türkiye addresses.
 *
 * Uses the NEW Places Autocomplete Data API (AutocompleteSuggestion /
 * fetchAutocompleteSuggestions) via `useMapsLibrary("places")`. It MUST be
 * rendered inside an `<APIProvider>` — use `<AddressMapsProvider>` so the
 * autocomplete and the pin map share one Google Maps script load + billing
 * session.
 *
 * Lives in `components/` rather than in a feature so BOTH the admin customer
 * form and the storefront checkout can use it: the ESLint boundaries config
 * forbids feature-ui → feature-ui imports, and `shared/` may not import
 * `components/ui/*`. `ui-primitive` is the only layer every caller may reach.
 *
 * The Google → TR field mapping is NOT here — it lives in
 * `shared/geo/tr-address-components.ts` so it is unit-testable.
 *
 * Session tokens follow Google's billing convention: one token per typing
 * session, refreshed after a completed selection.
 */
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { mapGooglePlaceComponents } from "@/shared/geo/tr-address-components";

import type { ParsedAddress } from "@/shared/geo/tr-address-components";

export type { ParsedAddress };

interface AddressAutocompleteProps {
  onSelect: (a: ParsedAddress) => void;
  /** Controlled value — when provided, this IS the address-line field. */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Restrict suggestions to these ISO region codes. Defaults to Türkiye. */
  regionCodes?: readonly string[];
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

const DEFAULT_REGION_CODES = ["tr"] as const;

export function AddressAutocomplete({
  onSelect,
  value,
  onChange,
  placeholder,
  regionCodes = DEFAULT_REGION_CODES,
  disabled,
  id,
  "aria-label": ariaLabel,
}: AddressAutocompleteProps) {
  const places = useMapsLibrary("places");
  const [internal, setInternal] = useState("");
  const input = value !== undefined ? value : internal;
  const setInput = (v: string) => {
    if (onChange) onChange(v);
    else setInternal(v);
  };
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `choose()` sets the input to the picked suggestion's text, which is a
  // dependency of the search effect below — without this guard that write
  // re-triggers a search for the text the user just finished selecting,
  // reopening the dropdown right after it closed.
  const skipNextSearchRef = useRef(false);
  // Depend on the region list by VALUE, not identity: a caller passing a fresh
  // array literal each render would otherwise restart the debounce every time.
  const regionKey = regionCodes.join(",");

  useEffect(() => {
    if (places && !tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken();
  }, [places]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    // All state writes are deferred into the debounce timer — the effect body
    // never calls setState synchronously (react-hooks/set-state-in-effect).
    debounceRef.current = setTimeout(async () => {
      if (!places || input.trim().length < 3) {
        setSuggestions([]);
        setOpen(false);
        setSearchError(false);
        return;
      }
      try {
        const res = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          ...(tokenRef.current ? { sessionToken: tokenRef.current } : {}),
          includedRegionCodes: regionKey.split(","),
          language: "tr",
        });
        setSuggestions(res.suggestions ?? []);
        setOpen(true);
        setSearchError(false);
      } catch {
        // Places API not enabled on the key, or a transient error. Not logged
        // via shared/logger — that module reads server-only env vars and
        // throws immediately if imported into a browser bundle. Surfacing it
        // in the UI instead is what keeps this from looking like "search does
        // nothing" with zero trace of why.
        setSuggestions([]);
        setOpen(false);
        setSearchError(true);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [places, input, regionKey]);

  async function choose(s: google.maps.places.AutocompleteSuggestion) {
    const pred = s.placePrediction;
    if (!pred || !places) return;
    const place = pred.toPlace();
    await place.fetchFields({ fields: ["addressComponents", "location"] });
    const loc = place.location;
    onSelect(
      mapGooglePlaceComponents(
        place.addressComponents ?? [],
        loc ? { lat: loc.lat(), lng: loc.lng() } : null,
      ),
    );
    skipNextSearchRef.current = true;
    setInput(pred.text?.text ?? "");
    setSuggestions([]);
    setOpen(false);
    // fresh session token after a completed selection (Google billing convention)
    tokenRef.current = new places.AutocompleteSessionToken();
  }

  return (
    <div className="relative">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={ariaLabel ?? "Adres"}
        {...(id ? { id } : {})}
        {...(disabled ? { disabled: true } : {})}
        {...(placeholder ? { placeholder } : {})}
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          {suggestions.map((s, i) => (
            <li key={s.placePrediction?.placeId ?? i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                // onMouseDown (not onClick) so it fires before the input blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(s);
                }}
              >
                {s.placePrediction?.text?.text ?? ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchError ? (
        <p className="mt-1 text-xs text-muted-foreground" role="status">
          Adres araması şu an kullanılamıyor — haritadan seçebilir veya
          alanları elle doldurabilirsiniz.
        </p>
      ) : null}
    </div>
  );
}
