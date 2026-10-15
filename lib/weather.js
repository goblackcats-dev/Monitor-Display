// Today's high / low / condition from Open-Meteo (free, no API key). Configure with WEATHER_CITY
// (e.g. "Columbus, OH") or WEATHER_LAT + WEATHER_LON. WEATHER_UNITS=fahrenheit|celsius (default fahrenheit).
const TTL = 15 * 60e3;
let cache = { at: 0, v: null };
let place = null; // geocoded once

export const weatherConfigured = () => !!(process.env.WEATHER_CITY || (process.env.WEATHER_LAT && process.env.WEATHER_LON));

async function locate() {
  if (place) return place;
  if (process.env.WEATHER_LAT && process.env.WEATHER_LON) {
    return (place = { lat: Number(process.env.WEATHER_LAT), lon: Number(process.env.WEATHER_LON) });
  }
  // The geocoder matches on the city name only, so "Columbus, OH" is searched as "Columbus"
  // and the rest ("OH") is used to pick the right result.
  const [name, ...rest] = process.env.WEATHER_CITY.split(',').map((s) => s.trim());
  const hint = rest.join(' ').toLowerCase();
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10`, { signal: AbortSignal.timeout(8000) });
  const results = (await r.json()).results || [];
  const pick = results.find((x) => hint && [x.admin1, x.admin1_id && '', x.country, x.country_code].some((f) => f && f.toLowerCase().includes(hint))) || results[0];
  if (!pick) throw new Error(`No place found for "${process.env.WEATHER_CITY}"`);
  return (place = { lat: pick.latitude, lon: pick.longitude });
}

// WMO weather codes -> a short symbol key the page turns into a glyph.
function kind(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

export async function weather() {
  if (!weatherConfigured()) return null;
  if (cache.v && Date.now() - cache.at < TTL) return cache.v;
  try {
    const { lat, lon } = await locate();
    const unit = process.env.WEATHER_UNITS === 'celsius' ? 'celsius' : 'fahrenheit';
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=${unit}&timezone=auto&forecast_days=1`;
    const j = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json();
    const d = j.daily;
    // Sunrise/sunset come as local wall-clock strings; turn them into real instants so the page can dim at night
    // whatever time zone the display itself is set to.
    const instant = (s) => Date.parse(s + 'Z') - j.utc_offset_seconds * 1000;
    cache = { at: Date.now(), v: { high: Math.round(d.temperature_2m_max[0]), low: Math.round(d.temperature_2m_min[0]), kind: kind(d.weather_code[0]), unit: unit === 'celsius' ? 'C' : 'F', sunrise: instant(d.sunrise[0]), sunset: instant(d.sunset[0]) } };
  } catch (e) {
    // Keep showing the last good reading; retry in a minute rather than hammering the API.
    cache = { at: Date.now() - TTL + 60e3, v: cache.v };
  }
  return cache.v;
}
