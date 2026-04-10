/**
 * US state base sales tax rates (2025).
 * These are state-level only — local rates vary. The user can override per-project.
 */

const STATE_TAX_RATES: Record<string, number> = {
  AL: 4.0, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35,
  DE: 0, FL: 6.0, GA: 4.0, HI: 4.0, ID: 6.0, IL: 6.25, IN: 7.0,
  IA: 6.0, KS: 6.5, KY: 6.0, LA: 4.45, ME: 5.5, MD: 6.0,
  MA: 6.25, MI: 6.0, MN: 6.875, MS: 7.0, MO: 4.225, MT: 0,
  NE: 5.5, NV: 6.85, NH: 0, NJ: 6.625, NM: 5.0, NY: 4.0,
  NC: 4.75, ND: 5.0, OH: 5.75, OK: 4.5, OR: 0, PA: 6.0,
  RI: 7.0, SC: 6.0, SD: 4.2, TN: 7.0, TX: 6.25, UT: 6.1,
  VT: 6.0, VA: 5.3, WA: 6.5, WV: 6.0, WI: 5.0, WY: 4.0, DC: 6.0,
};

const FULL_STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

/**
 * Extract a 2-letter state abbreviation from a project address.
 * Handles "123 Main St, Beverly Hills, CA 90210" and "Los Angeles, California".
 */
export function getStateFromAddress(address: string): string | null {
  // Try 2-letter abbreviation near end of string (e.g. "CA 90210" or "CA,")
  const abbrMatch = address.match(/\b([A-Z]{2})\b(?:\s*\d{5}(?:-\d{4})?)?[,\s]*$/);
  if (abbrMatch && abbrMatch[1] in STATE_TAX_RATES) {
    return abbrMatch[1];
  }

  // Fallback: search for full state name anywhere in the address
  const lower = address.toLowerCase();
  for (const [name, abbr] of Object.entries(FULL_STATE_NAMES)) {
    if (lower.includes(name)) return abbr;
  }

  return null;
}

/** Get the state base tax rate for a project address. Returns 0 if state can't be detected. */
export function getTaxRateFromAddress(address: string): number {
  const state = getStateFromAddress(address);
  return state ? (STATE_TAX_RATES[state] ?? 0) : 0;
}
