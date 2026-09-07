import { State, City } from "country-state-city";

export interface RegionOption {
  code: string;
  name: string;
  cities: string[];
}

// Previously a hand-rolled list capped at exactly 4 cities per state/region
// across all 37 Nigerian states and 17 Ghanaian regions — real cities
// outside that tiny fixed set had no way to be selected at all (the field
// is a closed dropdown, not free text). country-state-city ships a real,
// much more complete dataset for both countries; `cities` on RegionOption
// is left empty here since neither of this file's two consumers read it
// directly — they call getCitiesForCountryRegion separately once a region
// is actually selected, which is where the real list is resolved.
const SUPPORTED_COUNTRY_CODES = ["GH", "NG"];

export function getRegionsForCountry(countryCode: string | null | undefined): RegionOption[] {
  if (!countryCode) return [];
  const normalized = countryCode.toUpperCase();
  if (!SUPPORTED_COUNTRY_CODES.includes(normalized)) return [];
  return State.getStatesOfCountry(normalized).map((state) => ({
    code: state.isoCode,
    name: state.name,
    cities: [],
  }));
}

export function getCitiesForCountryRegion(
  countryCode: string | null | undefined,
  regionNameOrCode: string | null | undefined,
): string[] {
  if (!countryCode || !regionNameOrCode) return [];
  const normalizedCountry = countryCode.toUpperCase();
  if (!SUPPORTED_COUNTRY_CODES.includes(normalizedCountry)) return [];

  const states = State.getStatesOfCountry(normalizedCountry);
  const normalizedRegion = regionNameOrCode.trim().toLowerCase();
  const state = states.find(
    (entry) => entry.isoCode.toLowerCase() === normalizedRegion || entry.name.toLowerCase() === normalizedRegion,
  );
  if (!state) return [];

  return City.getCitiesOfState(normalizedCountry, state.isoCode).map((city) => city.name);
}
