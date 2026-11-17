/**
 * Weather preferences, kept separate from the core Sunny preferences so a
 * weather reset cannot accidentally clear AI / privacy settings (and vice
 * versa). Stored locally — no account, no sync, no cloud.
 */

export type WeatherUnit = 'celsius' | 'fahrenheit';

export interface SavedPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  countryCode: string;
}

export interface WeatherPreferences {
  unit: WeatherUnit;
  activeLocation: SavedPlace | null;
  savedPlaces: SavedPlace[];
}

const STORAGE_KEY = 'sunny_weather_v1';
const MAX_SAVED_PLACES = 5;

export const defaultWeatherPreferences: WeatherPreferences = {
  unit: 'celsius',
  activeLocation: null,
  savedPlaces: [],
};

export function loadWeatherPreferences(): WeatherPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultWeatherPreferences, savedPlaces: [] };
    const parsed = JSON.parse(raw) as Partial<WeatherPreferences>;
    return {
      unit: parsed.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      activeLocation: parsed.activeLocation ?? null,
      savedPlaces: Array.isArray(parsed.savedPlaces) ? parsed.savedPlaces.slice(0, MAX_SAVED_PLACES) : [],
    };
  } catch {
    return { ...defaultWeatherPreferences, savedPlaces: [] };
  }
}

export const WEATHER_PREFS_CHANGED_EVENT = 'sunny:weather-prefs-changed';

export function saveWeatherPreferences(prefs: WeatherPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...prefs,
      savedPlaces: prefs.savedPlaces.slice(0, MAX_SAVED_PLACES),
    }));
  } catch {
    // localStorage may be unavailable in a sandboxed context.
  }
  // Let the main-screen digest know it should refetch for the new location or
  // unit. Guarded for non-browser test contexts.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(WEATHER_PREFS_CHANGED_EVENT));
  }
}

/** Stable id from coordinates so the same place cannot be saved twice. */
function placeId(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

export function addSavedPlace(prefs: WeatherPreferences, place: Omit<SavedPlace, 'id'>): WeatherPreferences {
  const id = placeId(place.latitude, place.longitude);
  const existing = prefs.savedPlaces.some((p) => p.id === id);
  const savedPlaces = existing
    ? prefs.savedPlaces
    : [...prefs.savedPlaces, { ...place, id }].slice(-MAX_SAVED_PLACES);
  const next = {
    ...prefs,
    savedPlaces,
    activeLocation: { ...place, id },
  };
  saveWeatherPreferences(next);
  return next;
}

export function removeSavedPlace(prefs: WeatherPreferences, id: string): WeatherPreferences {
  const savedPlaces = prefs.savedPlaces.filter((p) => p.id !== id);
  const next = {
    ...prefs,
    savedPlaces,
    activeLocation: prefs.activeLocation?.id === id ? null : prefs.activeLocation,
  };
  saveWeatherPreferences(next);
  return next;
}

export function setActiveLocation(prefs: WeatherPreferences, location: SavedPlace | null): WeatherPreferences {
  const next = { ...prefs, activeLocation: location };
  saveWeatherPreferences(next);
  return next;
}

export function setWeatherUnit(prefs: WeatherPreferences, unit: WeatherUnit): WeatherPreferences {
  const next = { ...prefs, unit };
  saveWeatherPreferences(next);
  return next;
}
