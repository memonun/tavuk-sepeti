/**
 * Utilities for validating Google Maps API configuration.
 */

/**
 * Check if the Google Maps API key looks valid.
 * This is a basic check — full validation happens at API call time.
 */
export function isValidGoogleMapsKey(key: string | undefined): boolean {
  if (!key) return false;
  // Google API keys are typically 39+ characters and alphanumeric with dashes/underscores
  return key.length > 30 && /^[a-zA-Z0-9_-]+$/.test(key);
}

/**
 * Validate that required Google Maps APIs are available.
 * Returns error message if validation fails.
 */
export function validateGoogleMapsSetup(apiKey: string | undefined): string | null {
  if (!apiKey) {
    return "Google Maps API key not configured (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY missing).";
  }

  if (!isValidGoogleMapsKey(apiKey)) {
    return "Google Maps API key appears invalid. Check NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY.";
  }

  // Check for required global objects that indicate API loaded
  if (typeof window !== "undefined") {
    if (!window.google?.maps) {
      return "Google Maps API failed to load. Check API key and referrer restrictions.";
    }
  }

  return null;
}

/**
 * Create a new session token with error handling.
 */
export function createSessionToken(places: typeof google.maps.places | null): google.maps.places.AutocompleteSessionToken | null {
  if (!places) return null;

  try {
    return new places.AutocompleteSessionToken();
  } catch {
    return null;
  }
}
