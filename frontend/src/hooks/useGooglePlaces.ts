/**
 * Custom hook for Google Places Autocomplete (New API).
 *
 * Uses AutocompleteSuggestion.fetchAutocompleteSuggestions() — the modern API
 * recommended by Google over the legacy AutocompleteService.
 *
 * Lazy-loads the Google Maps JS API on first focus (only the Places library).
 * Session tokens group prediction + detail calls into one billing session.
 *
 * Graceful degradation: returns { ready: false } when API key is missing or load fails.
 *
 * @see https://developers.google.com/maps/documentation/javascript/place-autocomplete-data
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

export interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;

// ── Singleton loader ────────────────────────────────────────────────────────

let loadPromise: Promise<void> | null = null;
let optionsSet = false;

function ensureGooglePlacesLoaded(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.maps?.places?.AutocompleteSuggestion) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  if (!optionsSet) {
    setOptions({ key: API_KEY || "", v: "weekly" });
    optionsSet = true;
  }

  loadPromise = (importLibrary("places") as Promise<unknown>)
    .then(() => undefined)
    .catch((err) => {
      // Allow retry on next init() call
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

// ── Address parser ──────────────────────────────────────────────────────────

function parseAddressComponents(
  components: google.maps.places.AddressComponent[],
): ParsedAddress {
  const get = (type: string) =>
    components.find((c) => c.types.includes(type));

  const streetNumber = get("street_number")?.longText || "";
  const route = get("route")?.shortText || "";

  const city =
    get("locality")?.longText ||
    get("sublocality_level_1")?.longText ||
    get("administrative_area_level_2")?.longText ||
    "";

  const state = get("administrative_area_level_1")?.shortText || "";
  const zip = get("postal_code")?.longText || "";

  return {
    street: [streetNumber, route].filter(Boolean).join(" "),
    city,
    state: state.slice(0, 2).toUpperCase(),
    zip: zip.slice(0, 10),
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface UseGooglePlacesOptions {
  /** Current input value to search for predictions */
  input: string;
  /** Whether to skip fetching (e.g., after a selection) */
  skip?: boolean;
  debounceMs?: number;
}

export interface Prediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
  /** Original PlacePrediction for toPlace() call */
  _raw: google.maps.places.PlacePrediction;
}

export interface UseGooglePlacesReturn {
  ready: boolean;
  predictions: Prediction[];
  clearPredictions: () => void;
  selectPrediction: (prediction: Prediction) => Promise<ParsedAddress | null>;
  init: () => void;
}

export function useGooglePlaces({
  input,
  skip = false,
  debounceMs = 300,
}: UseGooglePlacesOptions): UseGooglePlacesReturn {
  const [ready, setReady] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  // Track mounted state for safe async updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Clean up session token on unmount
      sessionTokenRef.current = null;
    };
  }, []);

  // Initialize: lazy-load Google Maps API on first call
  const init = useCallback(() => {
    if (ready || !API_KEY) return;

    ensureGooglePlacesLoaded()
      .then(() => {
        if (!mountedRef.current) return;
        sessionTokenRef.current =
          new google.maps.places.AutocompleteSessionToken();
        setReady(true);
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn("[Estim8r] Google Places failed to load:", err);
      });
  }, [ready]);

  // Fetch predictions when input changes
  useEffect(() => {
    if (!ready || skip) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!input || input.length < 3) {
      setPredictions([]);
      return;
    }

    const currentId = ++requestIdRef.current;

    debounceRef.current = setTimeout(() => {
      google.maps.places.AutocompleteSuggestion
        .fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: ["us"],
          sessionToken: sessionTokenRef.current ?? undefined,
        })
        .then(({ suggestions }) => {
          if (currentId !== requestIdRef.current || !mountedRef.current) return;

          const mapped: Prediction[] = suggestions
            .filter((s) => s.placePrediction)
            .map((s) => {
              const p = s.placePrediction!;
              return {
                placeId: p.placeId,
                mainText: p.mainText?.text ?? p.text.text,
                secondaryText: p.secondaryText?.text ?? "",
                fullText: p.text.text,
                _raw: p,
              };
            });
          setPredictions(mapped);
        })
        .catch((err) => {
          if (currentId === requestIdRef.current && mountedRef.current) {
            setPredictions([]);
          }
          if (import.meta.env.DEV) console.warn("[Estim8r] Places prediction error:", err);
        });
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, ready, skip, debounceMs]);

  const clearPredictions = useCallback(() => {
    setPredictions([]);
  }, []);

  // Select a prediction: convert to Place, fetch address components
  const selectPrediction = useCallback(
    async (prediction: Prediction): Promise<ParsedAddress | null> => {
      try {
        const place = prediction._raw.toPlace();
        await place.fetchFields({ fields: ["addressComponents"] });

        // Rotate session token for next autocomplete session
        sessionTokenRef.current =
          new google.maps.places.AutocompleteSessionToken();

        if (place.addressComponents) {
          return parseAddressComponents(place.addressComponents);
        }
        return null;
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[Estim8r] Place details error:", err);
        return null;
      }
    },
    [],
  );

  return { ready, predictions, clearPredictions, selectPrediction, init };
}
