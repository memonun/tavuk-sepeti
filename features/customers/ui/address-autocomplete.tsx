"use client";

/**
 * Google Places autocomplete helper for the customer address form.
 *
 * Uses the NEW Places Autocomplete Data API (AutocompleteSuggestion /
 * fetchAutocompleteSuggestions) via `useMapsLibrary("places")`. It MUST be
 * rendered inside an `<APIProvider>` — the form lifts that provider up so the
 * autocomplete and the pin map share one Google Maps script load + billing
 * session.
 *
 * On selecting a suggestion it resolves the place's address components +
 * location and emits a ParsedAddress; the form maps those onto its structured
 * Türkiye address fields and the coordinate.
 *
 * Session tokens follow Google's billing convention: one token per typing
 * session, refreshed after a completed selection.
 */
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

export interface ParsedAddress {
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  postal_code: string;
  lat: number;
  lng: number;
}

export function AddressAutocomplete({ onSelect }: { onSelect: (a: ParsedAddress) => void }) {
  const places = useMapsLibrary("places");
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (places && !tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken();
  }, [places]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // All state writes are deferred into the debounce timer — the effect body
    // never calls setState synchronously (react-hooks/set-state-in-effect).
    debounceRef.current = setTimeout(async () => {
      if (!places || input.trim().length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      try {
        const res = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          ...(tokenRef.current ? { sessionToken: tokenRef.current } : {}),
          includedRegionCodes: ["tr"],
          language: "tr",
        });
        setSuggestions(res.suggestions ?? []);
        setOpen(true);
      } catch {
        // Places API not enabled on the key, or transient error — fail quiet.
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [places, input]);

  async function choose(s: google.maps.places.AutocompleteSuggestion) {
    const pred = s.placePrediction;
    if (!pred || !places) return;
    const place = pred.toPlace();
    await place.fetchFields({ fields: ["addressComponents", "location"] });
    const comp = place.addressComponents ?? [];
    const long = (type: string) =>
      comp.find((c) => c.types.includes(type))?.longText ?? "";
    const loc = place.location;
    onSelect({
      city: long("administrative_area_level_1"),
      district: long("administrative_area_level_2"),
      neighborhood:
        long("administrative_area_level_4") ||
        long("neighborhood") ||
        long("sublocality_level_1") ||
        long("sublocality_level_2"),
      street: long("route"),
      building_no: long("street_number"),
      postal_code: long("postal_code"),
      lat: loc ? loc.lat() : 0,
      lng: loc ? loc.lng() : 0,
    });
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
        aria-label="Adres ara (Google)"
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
    </div>
  );
}
