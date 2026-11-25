import { metersToSegment, thin } from "./geo";
import { HALF_WINDOW } from "./planner";
import { bitOf, type LngLat, type NeedId, type Poi, type Route } from "./types";

export interface Elsewhere {
  /** Moments (s) whose stretch covers every need: the closest before and after, nearest first. */
  times: number[];
  /** Needs found nowhere along the route. */
  missing: NeedId[];
}

const STEP = 60; // s between candidate moments
const CELL = 0.08; // degrees, wider than the corridor at Spanish latitudes

/**
 * Finds other moments of the trip that cover everything, using only the catalogue.
 * Driving times are still measured by the normal search once a moment is chosen.
 */
export function findElsewhere(
  route: Route, pois: Poi[], needs: NeedId[], at: number, tried: number[] = [], corridor = 4900,
): Elsewhere {
  const bits = needs.map(bitOf);
  const wanted = bits.reduce((a, b) => a | b, 0);

  // Route segments, with their time, in a grid.
  const path = thin(route.coords, 300);
  const times: number[] = [];
  for (let i = 0, j = 0; i < path.length; i++) {
    while (j + 1 < route.coords.length && route.coords[j] !== path[i]) j++;
    times.push(route.cum[j]);
  }
  const grid = new Map<string, number[]>();
  const add = (p: LngLat, i: number) => {
    const k = `${Math.floor(p[0] / CELL)}_${Math.floor(p[1] / CELL)}`;
    const cell = grid.get(k);
    if (!cell) grid.set(k, [i]); else if (cell[cell.length - 1] !== i) cell.push(i);
  };
  for (let i = 0; i + 1 < path.length; i++) { add(path[i], i); add(path[i + 1], i); }

  // Minutes of the trip at which each need is within reach.
  const n = Math.floor(route.duration / STEP) + 1;
  const reach = needs.map(() => new Uint8Array(n));
  for (const p of pois) {
    if (!(p.mask & wanted)) continue;
    const cx = Math.floor(p.lng / CELL), cy = Math.floor(p.lat / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.get(`${cx + dx}_${cy + dy}`) ?? []) {
        const m = Math.min(n - 1, Math.round(times[i] / STEP));
        if (bits.every((b, k) => !(p.mask & b) || reach[k][m])) continue;
        if (metersToSegment([p.lng, p.lat], path[i], path[i + 1]) > corridor) continue;
        bits.forEach((b, k) => { if (p.mask & b) reach[k][m] = 1; });
      }
    }
  }

  const missing = needs.filter((_, k) => !reach[k].includes(1));
  if (missing.length) return { times: [], missing };

  const covers = (t: number, half: number) =>
    reach.every((r) => r.subarray(Math.max(0, t - half), Math.min(n, t + half + 1)).includes(1));
  const start = Math.min(n - 1, Math.max(0, Math.round(at / STEP)));
  const free = (t: number) => tried.every((x) => Math.abs(x / STEP - t) >= 5);
  const wide = HALF_WINDOW / STEP - 1;

  const found: number[] = [];
  for (const dir of [-1, 1]) {
    const next = (from: number, half: number, limit: number) => {
      for (let t = from; t >= 0 && t < n && Math.abs(t - from) <= limit; t += dir) if (free(t) && covers(t, half)) return t;
      return null;
    };
    const edge = next(start + dir, wide, n);
    if (edge == null) continue;
    // Move a little further so the place is near the chosen moment, not at the edge of the stretch.
    found.push((next(edge, 10, 20) ?? edge) * STEP);
  }
  return { times: found.sort((a, b) => Math.abs(a - at) - Math.abs(b - at)), missing: [] };
}
