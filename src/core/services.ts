import type { LngLat, Poi, Route } from "./types";

const OSRM = "https://router.project-osrm.org";
const fmt = (c: LngLat[]) => c.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(";");

async function getJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`The service returned ${res.status}`);
  return res.json();
}

export async function fetchRoute(points: LngLat[], signal?: AbortSignal): Promise<Route> {
  const data = await getJson(`${OSRM}/route/v1/driving/${fmt(points)}?overview=full&geometries=geojson&annotations=duration`, signal);
  const r = data.routes?.[0];
  if (!r) throw new Error("No driving route between those points");
  const coords: LngLat[] = r.geometry.coordinates;
  const steps: number[] = r.legs.flatMap((l: any) => l.annotation.duration);
  const sum = steps.reduce((a, b) => a + b, 0) || 1;
  // Annotations exclude turn costs, so they are scaled to the total duration.
  const cum = [0];
  for (let i = 0; i + 1 < coords.length; i++) cum.push(cum[i] + ((steps[i] ?? 0) * r.duration) / sum);
  return { coords, cum, duration: r.duration, distance: r.distance };
}

export async function fetchMatrix(points: LngLat[], signal?: AbortSignal): Promise<(number | null)[][]> {
  const data = await getJson(`${OSRM}/table/v1/driving/${fmt(points)}?annotations=duration`, signal);
  if (data.code !== "Ok") throw new Error("Could not compute driving times");
  return data.durations;
}

export interface Place {
  label: string;
  point: LngLat;
  /** The device's current position. */
  here?: boolean;
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const data = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en&bbox=-9.6,35.8,4.5,43.9`, signal);
  const seen = new Set<string>();
  return data.features.map((f: any) => {
    const p = f.properties;
    const parts = [p.name ?? [p.street, p.housenumber].filter(Boolean).join(" "), p.city, p.state].filter(Boolean);
    return { label: [...new Set(parts)].join(", "), point: f.geometry.coordinates };
  }).filter((p: Place) => !seen.has(p.label) && seen.add(p.label));
}

type Row = [number, number, number, string];

/** Own catalogue in 0.5° tiles: only those the route touches are downloaded. */
const tiles = new Map<string, Promise<Poi[]>>();
let index: Promise<string[]> | null = null;

export async function loadPois(line: LngLat[], base: string, get: (url: string) => Promise<any> = getJson): Promise<Poi[]> {
  index ??= get(`${base}pois/index.json`).catch((e) => { index = null; throw e; });
  const known = new Set(await index);
  const keys = new Set<string>();
  for (const [x, y] of line)
    for (const dx of [-0.07, 0, 0.07])
      for (const dy of [-0.05, 0, 0.05]) keys.add(`${Math.floor((x + dx) * 2)}_${Math.floor((y + dy) * 2)}`);

  const list = await Promise.all([...keys].filter((k) => known.has(k)).map((k) => {
    let tile = tiles.get(k);
    if (!tile) {
      tile = get(`${base}pois/${k}.json`)
        .then((rows: Row[]) => rows.map(([lng, lat, mask, name]) => ({ lng, lat, mask, name })))
        .catch((e) => { tiles.delete(k); throw e; });
      tiles.set(k, tile);
    }
    return tile;
  }));
  return list.flat();
}
