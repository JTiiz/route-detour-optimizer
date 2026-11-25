import type { LngLat, Route } from "./types";

const R = 6371000, rad = Math.PI / 180;

export function meters(a: LngLat, b: LngLat) {
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad;
  return R * Math.hypot(x, y);
}

/** Distance (m) from P to segment AB, using a local projection. */
export function metersToSegment(p: LngLat, a: LngLat, b: LngLat) {
  const k = Math.cos(p[1] * rad);
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
  const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return R * rad * Math.hypot(ax + t * dx, ay + t * dy);
}

/** Point on the route at second t. */
export function pointAt(route: Route, t: number): LngLat {
  const { cum, coords } = route;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= t) lo = m; else hi = m;
  }
  const span = cum[hi] - cum[lo];
  const f = span ? Math.max(0, Math.min(1, (t - cum[lo]) / span)) : 0;
  return [coords[lo][0] + f * (coords[hi][0] - coords[lo][0]), coords[lo][1] + f * (coords[hi][1] - coords[lo][1])];
}

/** Second of the route closest to a point on the map. */
export function nearestTime(route: Route, p: LngLat) {
  let best = 0, bestD = Infinity;
  route.coords.forEach((c, i) => {
    const d = meters(c, p);
    if (d < bestD) { bestD = d; best = i; }
  });
  return route.cum[best];
}

export function sliceRoute(route: Route, from: number, to: number): LngLat[] {
  return [pointAt(route, from), ...route.coords.filter((_, i) => route.cum[i] > from && route.cum[i] < to), pointAt(route, to)];
}

/** Drops vertices that are too close together: enough to measure corridor distances. */
export function thin(line: LngLat[], minMeters: number): LngLat[] {
  const out = [line[0]];
  for (const p of line) if (meters(out[out.length - 1], p) >= minMeters) out.push(p);
  out.push(line[line.length - 1]);
  return out;
}
