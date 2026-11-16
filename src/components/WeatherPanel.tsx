import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, Droplets, MapPin, Moon, RefreshCw, Search, Sun, Sunrise, Sunset,
  Wind, X,
} from 'lucide-react';
import { sunnyBrain } from '@/renderer/services/sunnyBrain';
import {
  addSavedPlace, loadWeatherPreferences, removeSavedPlace, setActiveLocation,
  setWeatherUnit, type WeatherPreferences,
} from '@/lib/weather-preferences';
import type {
  WeatherForecast, WeatherLocation, WeatherAlert, RadarData,
} from '@/types/electron';

type Phase = 'idle' | 'loading' | 'ready' | 'error';

/** Pick a readable icon for a WMO weather code. */
function WeatherIcon({ code, isDay, size = 28 }: { code: number; isDay?: boolean; size?: number }) {
  const props = { size, 'aria-hidden': true as const };
  if (code >= 95) return <CloudLightning {...props} />;
  if (code >= 71 && code <= 86) return <CloudSnow {...props} />;
  if (code >= 51 && code <= 67) return <CloudRain {...props} />;
  if (code >= 80 && code <= 82) return <CloudRain {...props} />;
  if (code === 45 || code === 48) return <CloudFog {...props} />;
  if (code >= 1 && code <= 3) return <CloudSun {...props} />;
  if (code === 0) return isDay === false ? <Moon {...props} /> : <Sun {...props} />;
  return <Cloud {...props} />;
}

function formatTemp(value: number | undefined, unit: 'celsius' | 'fahrenheit'): string {
  if (value === undefined || !Number.isFinite(value)) return '--';
  return `${Math.round(value)}°${unit === 'celsius' ? 'C' : 'F'}`;
}

/** Open-Meteo returns wall-clock local times (e.g. "2026-11-16T14:00"). */
function formatHour(time: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  return hour === 0 ? 'Now' : `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`;
}

/** Convert latitude/longitude to a slippy-map tile at the given zoom. */
function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

const RADAR_ZOOM = 8;

export function WeatherPanel() {
  const [prefs, setPrefs] = useState<WeatherPreferences>(() => loadWeatherPreferences());
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [radar, setRadar] = useState<RadarData | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [radarIndex, setRadarIndex] = useState(0);

  const locationArg = useMemo(() => {
    const loc = prefs.activeLocation;
    return loc ? { latitude: loc.latitude, longitude: loc.longitude, name: loc.name } : 'auto';
  }, [prefs.activeLocation]);

  const loadForecast = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const data = await sunnyBrain.getWeatherForecast({ location: locationArg, unit: prefs.unit });
      setForecast(data);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the weather.');
      setPhase((current) => (current === 'loading' ? 'error' : current));
    }
  }, [locationArg, prefs.unit]);

  useEffect(() => { void loadForecast(); }, [loadForecast]);

  // US-only alerts, fetched after we know the location.
  useEffect(() => {
    if (!forecast || (prefs.activeLocation?.countryCode &&
        prefs.activeLocation.countryCode.toUpperCase() !== 'US')) {
      setAlerts([]);
      return;
    }
    if (prefs.activeLocation) {
      void sunnyBrain.getWeatherAlerts({
        latitude: prefs.activeLocation.latitude,
        longitude: prefs.activeLocation.longitude,
        countryCode: prefs.activeLocation.countryCode,
      }).then(setAlerts).catch(() => setAlerts([]));
    }
  }, [forecast, prefs.activeLocation]);

  // Radar loads with the forecast (it sits near the top of the vertical view).
  useEffect(() => {
    if (!forecast || radar) return;
    void sunnyBrain.getRadarFrames().then(setRadar).catch(() => setRadar({ host: '', frames: [] }));
  }, [forecast, radar]);

  const handleSearch = useCallback(async () => {
    const term = query.trim();
    if (!term || searching) return;
    setSearching(true);
    setSearchError('');
    setResults([]);
    try {
      setResults(await sunnyBrain.searchLocations(term));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Location search failed.');
    } finally {
      setSearching(false);
    }
  }, [query, searching]);

  const handleSelectPlace = useCallback((place: WeatherLocation) => {
    setPrefs((p) => addSavedPlace(p, place));
    setResults([]);
    setQuery('');
  }, []);

  const radarTiles = useMemo(() => {
    if (!radar || !prefs.activeLocation) return [];
    const { x, y } = latLonToTile(prefs.activeLocation.latitude, prefs.activeLocation.longitude, RADAR_ZOOM);
    const frame = radar.frames[Math.min(radarIndex, Math.max(0, radar.frames.length - 1))];
    const tiles: Array<{ key: string; base: string; overlay: string }> = [];
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        tiles.push({
          key: `${tx}-${ty}`,
          base: `https://tile.openstreetmap.org/${RADAR_ZOOM}/${tx}/${ty}.png`,
          overlay: frame && radar.host
            ? `${radar.host}${frame.path}/256/${RADAR_ZOOM}/${tx}/${ty}/2/1_1.png`
            : '',
        });
      }
    }
    return tiles;
  }, [radar, radarIndex, prefs.activeLocation]);

  const unit = prefs.unit;
  const stale = phase === 'error' && forecast !== null;
  const firstHour = forecast?.hourly?.[0];
  const rainNow = firstHour?.precipitationChance;

  return (
    <div className="weather-sheet">
      {/* Location header — Dark Sky style: place name, search, units */}
      <header className="weather-sheet-header">
        <div className="weather-sheet-title">
          <MapPin size={18} aria-hidden="true" />
          <span>{forecast?.location || prefs.activeLocation?.name || 'Your Location'}</span>
        </div>
        <div className="weather-sheet-actions">
          <button
            type="button"
            className="weather-sheet-icon-btn"
            onClick={() => setPrefs((p) => setWeatherUnit(p, p.unit === 'celsius' ? 'fahrenheit' : 'celsius'))}
            aria-label={`Switch to ${unit === 'celsius' ? 'Fahrenheit' : 'Celsius'}`}
          >
            °{unit === 'celsius' ? 'C' : 'F'}
          </button>
        </div>
      </header>

      <div className="weather-sheet-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
          placeholder="Change location — type a city"
          aria-label="Search for a city"
          maxLength={100}
        />
        <button type="button" onClick={() => void handleSearch()} disabled={searching || !query.trim()} aria-label="Search location">
          <Search size={20} />
        </button>
      </div>
      {searchError && <p className="weather-inline-error" role="alert">{searchError}</p>}
      {results.length > 0 && (
        <ul className="weather-results" aria-label="Location search results">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button type="button" onClick={() => handleSelectPlace(r)}>
                <MapPin size={16} aria-hidden="true" /> {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {prefs.savedPlaces.length > 0 && (
        <div className="weather-saved" aria-label="Saved places">
          {prefs.savedPlaces.map((p) => (
            <span key={p.id} className={`weather-place-chip${prefs.activeLocation?.id === p.id ? ' active' : ''}`}>
              <button type="button" onClick={() => setPrefs((prev) => setActiveLocation(prev, p))}>
                {p.name.split(',')[0]}
              </button>
              <button type="button" className="weather-place-remove" onClick={() => setPrefs((prev) => removeSavedPlace(prev, p.id))} aria-label={`Remove ${p.name}`}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {(phase === 'loading' || phase === 'idle') && !forecast && (
        <p className="weather-status" role="status">Getting the weather…</p>
      )}
      {phase === 'error' && !forecast && (
        <div className="weather-error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{error || 'No internet connection. Weather needs an internet connection.'}</span>
          <button type="button" className="weather-retry" onClick={() => void loadForecast()}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}
      {stale && (
        <div className="weather-stale" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Showing saved weather from {new Date(forecast!.fetchedAt).toLocaleString()} — could not refresh.</span>
          <button type="button" className="weather-retry" onClick={() => void loadForecast()}>Retry</button>
        </div>
      )}

      {forecast && (
        <div className="weather-sheet-body">
          {/* Big current conditions */}
          <div className="weather-hero">
            <WeatherIcon code={firstHour?.weatherCode ?? 0} isDay={forecast.isDay} size={92} />
            <div className="weather-hero-temp">{formatTemp(forecast.temperature, unit)}</div>
            <div className="weather-hero-feels">Feels like {formatTemp(forecast.feelsLike, unit)}</div>
            <div className="weather-hero-condition">{forecast.condition}</div>
            <div className="weather-hero-range">H: {formatTemp(forecast.high, unit)} &nbsp; L: {formatTemp(forecast.low, unit)}</div>
          </div>

          {/* Alert banner */}
          {alerts.length > 0 && (
            <div className="weather-alert-banner" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{alerts[0].event}{alerts.length > 1 ? ` +${alerts.length - 1} more` : ''}</span>
            </div>
          )}

          {/* Radar strip */}
          {radar && radar.frames.length > 0 && radarTiles.length > 0 && (
            <div className="weather-sheet-radar">
              <div className="weather-radar-map">
                {radarTiles.map((t) => (
                  <div className="weather-radar-tile" key={t.key}>
                    <img src={t.base} alt="" loading="lazy" />
                    {t.overlay && <img className="weather-radar-overlay" src={t.overlay} alt="" loading="lazy" />}
                  </div>
                ))}
              </div>
              <input
                className="weather-radar-slider"
                type="range" min={0} max={Math.max(0, radar.frames.length - 1)}
                value={Math.min(radarIndex, Math.max(0, radar.frames.length - 1))}
                onChange={(e) => setRadarIndex(Number(e.target.value))}
                aria-label="Radar time"
              />
            </div>
          )}

          {/* Precipitation summary + mini bars */}
          {forecast.hourly && forecast.hourly.length > 0 && (
            <div className="weather-precip">
              <p className="weather-precip-label">
                {rainNow !== undefined && rainNow > 40
                  ? `Rain likely — ${rainNow}% chance right now`
                  : rainNow !== undefined && rainNow > 10
                    ? `Light rain possible — ${rainNow}% chance`
                    : 'No rain expected soon'}
              </p>
              <div className="weather-precip-bars" aria-hidden="true">
                {forecast.hourly.slice(0, 12).map((h) => (
                  <span
                    key={h.time}
                    className="weather-precip-bar"
                    style={{ height: `${Math.max(4, h.precipitationChance ?? 0)}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hourly — vertical list, Dark Sky style */}
          {forecast.hourly && forecast.hourly.length > 0 && (
            <section className="weather-hourly" aria-label="Hourly forecast">
              <h4>Next 24 hours</h4>
              <div className="weather-hour-list">
                {forecast.hourly.map((h) => (
                  <div className="weather-hour-row" key={h.time}>
                    <span className="weather-hour-time-big">{formatHour(h.time)}</span>
                    <span className="weather-hour-mini-bar" style={{ height: `${Math.max(4, h.precipitationChance ?? 0)}%` }} aria-hidden="true" />
                    <span className="weather-hour-icon"><WeatherIcon code={h.weatherCode} size={26} /></span>
                    <span className="weather-hour-desc">{h.condition}</span>
                    <span className="weather-hour-value">{formatTemp(h.temperature, unit)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Daily — vertical rows with temp range bars */}
          {forecast.forecast && forecast.forecast.length > 0 && (
            <section className="weather-daily" aria-label="7-day forecast">
              <h4>7-day forecast</h4>
              <div className="weather-day-list">
                {forecast.forecast.map((d) => (
                  <div className="weather-day-row" key={d.date}>
                    <span className="weather-day-name-big">{d.dayName}</span>
                    <span className="weather-day-icon-big"><WeatherIcon code={d.weatherCode} size={30} /></span>
                    <span className="weather-day-rain-big">{d.precipitationChance !== undefined ? `${d.precipitationChance}%` : ''}</span>
                    <span className="weather-day-range">
                      <span
                        className="weather-day-range-fill"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((d.low ?? 0) + 10) * 3))}%`,
                          width: `${Math.max(8, Math.min(100, ((d.high ?? 0) - (d.low ?? 0)) * 3))}%`,
                        }}
                      />
                    </span>
                    <span className="weather-day-low">{formatTemp(d.low, unit)}</span>
                    <span className="weather-day-high">{formatTemp(d.high, unit)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Details + sun times */}
          <div className="weather-detail-grid">
            <div><Droplets size={17} aria-hidden="true" /> Humidity <strong>{forecast.humidity}%</strong></div>
            <div><Wind size={17} aria-hidden="true" /> Wind <strong>{forecast.windSpeed} {unit === 'celsius' ? 'km/h' : 'mph'} {forecast.windDirection}</strong></div>
          </div>
          {(forecast.sunrise || forecast.sunset) && (
            <p className="weather-sun-times">
              <Sunrise size={17} aria-hidden="true" />
              {forecast.sunrise ? new Date(forecast.sunrise).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--'}
              <span aria-hidden="true"> · </span>
              <Sunset size={17} aria-hidden="true" />
              {forecast.sunset ? new Date(forecast.sunset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--'}
            </p>
          )}

          <p className="weather-updated">
            Updated {new Date(forecast.fetchedAt).toLocaleString()}
            <button type="button" onClick={() => void loadForecast()} disabled={phase === 'loading'} aria-label="Refresh weather">
              <RefreshCw size={14} className={phase === 'loading' ? 'spin' : ''} /> Refresh
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
