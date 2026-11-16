import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, Droplets, Gauge, MapPin, Moon, RefreshCw, Search, Sun,
  Thermometer, Wind, X,
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
function WeatherIcon({ code, isDay, size = 26 }: { code: number; isDay?: boolean; size?: number }) {
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
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 || 12}${suffix}`;
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
  const [showRadar, setShowRadar] = useState(false);
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
      // Keep any stale forecast we already have — clearly labeled in the UI.
      setPhase((current) => (current === 'loading' ? 'error' : current));
    }
  }, [locationArg, prefs.unit]);

  // Reload whenever the active location or unit changes.
  useEffect(() => { void loadForecast(); }, [loadForecast]);

  // US-only alerts, fetched after we know the location.
  useEffect(() => {
    if (!forecast || prefs.activeLocation?.countryCode &&
        prefs.activeLocation.countryCode.toUpperCase() !== 'US') {
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

  // Radar loads only when the user opens it.
  useEffect(() => {
    if (!showRadar || radar) return;
    void sunnyBrain.getRadarFrames().then(setRadar).catch(() => setRadar({ host: '', frames: [] }));
  }, [showRadar, radar]);

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

  const handleRemovePlace = useCallback((id: string) => {
    setPrefs((p) => removeSavedPlace(p, id));
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

  return (
    <div className="weather-panel">
      {/* Controls: location search, saved places, units */}
      <div className="weather-controls">
        <div className="weather-search">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
            placeholder="Search for a city"
            aria-label="Search for a city"
            maxLength={100}
          />
          <button type="button" onClick={() => void handleSearch()} disabled={searching || !query.trim()}>
            <Search size={18} aria-hidden="true" /> {searching ? 'Searching…' : 'Search'}
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
                <button type="button" className="weather-place-remove" onClick={() => handleRemovePlace(p.id)} aria-label={`Remove ${p.name}`}>
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="weather-unit-row">
          <span>Temperature</span>
          <div className="weather-unit-toggle" role="group" aria-label="Temperature unit">
            <button type="button" aria-pressed={unit === 'celsius'} onClick={() => setPrefs((p) => setWeatherUnit(p, 'celsius'))}>°C</button>
            <button type="button" aria-pressed={unit === 'fahrenheit'} onClick={() => setPrefs((p) => setWeatherUnit(p, 'fahrenheit'))}>°F</button>
          </div>
        </div>
      </div>

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
        <div className="weather-content">
          <div className="weather-current">
            <div className="weather-current-icon">
              <WeatherIcon code={forecast.hourly?.[0]?.weatherCode ?? 0} isDay={forecast.isDay} size={56} />
            </div>
            <div className="weather-current-main">
              <p className="weather-current-temp">{formatTemp(forecast.temperature, unit)}</p>
              <p className="weather-current-condition">{forecast.condition}</p>
              <p className="weather-current-place"><MapPin size={15} aria-hidden="true" /> {forecast.location}</p>
            </div>
            <div className="weather-current-highlow">
              <span>H: {formatTemp(forecast.high, unit)}</span>
              <span>L: {formatTemp(forecast.low, unit)}</span>
            </div>
          </div>

          <div className="weather-stats">
            {forecast.feelsLike !== undefined && (
              <div><Thermometer size={16} aria-hidden="true" /> Feels like <strong>{formatTemp(forecast.feelsLike, unit)}</strong></div>
            )}
            {forecast.humidity !== undefined && (
              <div><Droplets size={16} aria-hidden="true" /> Humidity <strong>{forecast.humidity}%</strong></div>
            )}
            {forecast.windSpeed !== undefined && (
              <div><Wind size={16} aria-hidden="true" /> Wind <strong>{forecast.windSpeed} {unit === 'celsius' ? 'km/h' : 'mph'}{forecast.windDirection ? ` ${forecast.windDirection}` : ''}</strong></div>
            )}
            {forecast.precipitationChance !== undefined && (
              <div><CloudRain size={16} aria-hidden="true" /> Rain <strong>{forecast.precipitationChance}%</strong></div>
            )}
            {forecast.uvIndex !== undefined && (
              <div><Sun size={16} aria-hidden="true" /> UV <strong>{forecast.uvIndex}</strong></div>
            )}
            {forecast.pressure !== undefined && (
              <div><Gauge size={16} aria-hidden="true" /> Pressure <strong>{forecast.pressure} hPa</strong></div>
            )}
          </div>

          {forecast.hourly && forecast.hourly.length > 0 && (
            <section className="weather-hourly" aria-label="Hourly forecast for the next 24 hours">
              <h4>Next 24 hours</h4>
              <div className="weather-hourly-track">
                {forecast.hourly.map((h) => (
                  <div className="weather-hour" key={h.time}>
                    <span className="weather-hour-time">{formatHour(h.time)}</span>
                    <WeatherIcon code={h.weatherCode} size={24} />
                    <span className="weather-hour-temp">{formatTemp(h.temperature, unit)}</span>
                    {h.precipitationChance !== undefined && <span className="weather-hour-rain">{h.precipitationChance}%</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {forecast.forecast && forecast.forecast.length > 0 && (
            <section className="weather-daily" aria-label="7-day forecast">
              <h4>7-day forecast</h4>
              <div className="weather-day-list">
                {forecast.forecast.map((d) => (
                  <div className="weather-day" key={d.date}>
                    <span className="weather-day-name">{d.dayName}</span>
                    <span className="weather-day-icon"><WeatherIcon code={d.weatherCode} size={24} /></span>
                    {d.precipitationChance !== undefined && <span className="weather-day-rain">{d.precipitationChance}%</span>}
                    <span className="weather-day-bar">
                      <span className="weather-day-bar-fill" style={{ left: `${Math.max(0, Math.min(100, ((d.low ?? 0) + 20) * 2))}%`, width: `${Math.max(8, Math.min(100, ((d.high ?? 0) - (d.low ?? 0)) * 2))}%` }} />
                    </span>
                    <span className="weather-day-temps">{formatTemp(d.high, unit)} / {formatTemp(d.low, unit)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {alerts.length > 0 && (
            <section className="weather-alerts" aria-label="Weather alerts">
              <h4><AlertTriangle size={18} aria-hidden="true" /> Weather alerts</h4>
              {alerts.map((a, i) => (
                <div className={`weather-alert severity-${a.severity.toLowerCase()}`} key={i}>
                  <strong>{a.event}</strong>
                  {a.headline && <p>{a.headline}</p>}
                </div>
              ))}
            </section>
          )}

          <section className="weather-radar" aria-label="Weather radar">
            <button type="button" className="weather-radar-toggle" onClick={() => setShowRadar((v) => !v)} aria-expanded={showRadar}>
              {showRadar ? 'Hide radar' : 'Show radar'}
            </button>
            {showRadar && (
              <div className="weather-radar-body">
                {radar && radar.frames.length > 0 ? (
                  <>
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
                    <p className="weather-radar-caption">
                      {new Date(radar.frames[Math.min(radarIndex, radar.frames.length - 1)].time * 1000).toLocaleTimeString()}
                    </p>
                  </>
                ) : (
                  <p className="weather-status">Radar is not available right now.</p>
                )}
              </div>
            )}
          </section>

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
