import crypto from 'node:crypto';
import { readJson, writeJson } from './env.js';

const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const clientId = () => process.env.SPOTIFY_CLIENT_ID;
const redirectUri = (port) => `http://127.0.0.1:${port}/auth/spotify/callback`;

let pending = null; // PKCE verifier for the in-flight login
let tokens = readJson('spotify.json', null);
let last = { at: 0, value: null };

export const configured = () => !!clientId();
export const authed = () => !!tokens?.refresh_token;

export function loginUrl(port) {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const state = crypto.randomBytes(12).toString('hex');
  pending = { verifier, state };
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({
    client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(port),
    scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge, state,
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenRequest(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), ...body }),
  });
  if (!r.ok) throw new Error(`Spotify token ${r.status}`);
  return r.json();
}

function store(j) {
  tokens = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || tokens?.refresh_token,
    expires_at: Date.now() + (j.expires_in - 60) * 1000,
  };
  writeJson('spotify.json', tokens);
}

export async function handleCallback(port, code, state) {
  if (!pending || state !== pending.state) throw new Error('Bad OAuth state');
  const j = await tokenRequest({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri(port), code_verifier: pending.verifier,
  });
  pending = null;
  store(j);
}

async function accessToken() {
  if (!tokens) return null;
  if (Date.now() > tokens.expires_at) store(await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }));
  return tokens.access_token;
}

async function call(method, path, query) {
  const tok = await accessToken();
  if (!tok) throw new Error('Not logged in');
  const url = `${API}${path}${query ? '?' + new URLSearchParams(query) : ''}`;
  return fetch(url, { method, headers: { Authorization: `Bearer ${tok}` } });
}

export async function nowPlaying() {
  if (!authed()) return { state: configured() ? 'login' : 'unconfigured' };
  if (Date.now() - last.at < 1500 && last.value) return last.value;
  let value;
  try {
    const r = await call('GET', '/me/player');
    if (r.status === 204) value = { state: 'idle' };
    else if (r.status === 429) return last.value || { state: 'idle' };
    else if (!r.ok) value = { state: 'error', status: r.status };
    else {
      const j = await r.json();
      const it = j.item;
      value = !it ? { state: 'idle' } : {
        state: 'ok',
        playing: j.is_playing,
        title: it.name,
        artist: (it.artists || []).map((a) => a.name).join(', '),
        album: it.album?.name || it.show?.name || '',
        art: it.album?.images?.[0]?.url || it.images?.[0]?.url || null,
        progressMs: j.progress_ms,
        durationMs: it.duration_ms,
        volume: j.device?.volume_percent ?? null,
        device: j.device?.name || '',
        shuffle: j.shuffle_state,
        fetchedAt: Date.now(),
      };
    }
  } catch (e) {
    value = { state: 'error', message: String(e.message) };
  }
  last = { at: Date.now(), value };
  return value;
}

// action: play | pause | next | prev | volume | seek | shuffle
export async function control(action, v) {
  const map = {
    play: ['PUT', '/me/player/play'],
    pause: ['PUT', '/me/player/pause'],
    next: ['POST', '/me/player/next'],
    prev: ['POST', '/me/player/previous'],
    volume: ['PUT', '/me/player/volume', { volume_percent: Math.max(0, Math.min(100, Math.round(+v))) }],
    seek: ['PUT', '/me/player/seek', { position_ms: Math.max(0, Math.round(+v)) }],
    shuffle: ['PUT', '/me/player/shuffle', { state: !!v }],
  };
  const m = map[action];
  if (!m) throw new Error('Unknown action');
  const r = await call(...m);
  last.at = 0; // force refresh
  if (!r.ok && r.status !== 204) throw new Error(`Spotify ${r.status}`);
}
