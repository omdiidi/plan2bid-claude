/**
 * Minimal ambient type declarations for Google Maps Places API (New).
 * Covers only the types used by useGooglePlaces + AddressAutocomplete.
 * Uses the modern AutocompleteSuggestion / Place API (not legacy AutocompleteService).
 * Avoids installing the full @types/google.maps (500KB+).
 */

declare namespace google.maps.places {
  class AutocompleteSessionToken {}

  interface AutocompleteSuggestion {
    placePrediction?: PlacePrediction;
  }

  // Static method lives on the class itself
  const AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(
      request: FetchAutocompleteSuggestionsRequest,
    ): Promise<{ suggestions: AutocompleteSuggestion[] }>;
  };

  interface FetchAutocompleteSuggestionsRequest {
    input: string;
    sessionToken?: AutocompleteSessionToken;
    includedPrimaryTypes?: string[];
    includedRegionCodes?: string[];
    language?: string;
  }

  interface PlacePrediction {
    placeId: string;
    text: { text: string; matches?: Array<{ offset: number; length: number }> };
    mainText?: { text: string; matches?: Array<{ offset: number; length: number }> };
    secondaryText?: { text: string };
    toPlace(): Place;
  }

  class Place {
    addressComponents?: AddressComponent[];
    fetchFields(request: { fields: string[] }): Promise<{ place: Place }>;
  }

  interface AddressComponent {
    longText: string;
    shortText: string;
    types: string[];
  }
}
