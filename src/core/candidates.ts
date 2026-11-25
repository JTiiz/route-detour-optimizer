import { meters, metersToSegment, thin } from "./geo";
import { bitOf, type LngLat, type NeedId, type Poi, type Stop } from "./types";

/** Walking metres that still count as "the same place". */
const WALK = 350;

/** Groups services within walking distance and picks the stops worth evaluating. */
export function buildStops(pois: Poi[], line: LngLat[], needs: NeedId[], corridor = 5000, limit = 48): Stop[] {
  const bits = needs.map(bitOf);
  const wanted = bits.reduce((a, b) => a | b, 0);
  const path = thin(line, 150);

  const pad = corridor / 80000;
  const lngs = path.map((p) => p[0]), lats = path.map((p) => p[1]);
  const w = Math.min(...lngs) - pad, e = Math.max(...lngs) + pad;
  const s = Math.min(...lats) - pad, n = Math.max(...lats) + pad;

  const near: { p: Poi; d: number }[] = [];
  for (const p of pois) {
    if (!(p.mask & wanted) || p.lng < w || p.lng > e || p.lat < s || p.lat > n) continue;
    let d = Infinity;
    for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, metersToSegment([p.lng, p.lat], path[i], path[i + 1]));
    if (d <= corridor) near.push({ p, d });
  }
  near.sort((a, b) => a.d - b.d);

  const used = new Set<Poi>();
  const found: { stop: Stop; d: number; n: number }[] = [];
  for (const { p, d } of near) {
    if (used.has(p)) continue;
    used.add(p);
    const around = [{ q: p, m: 0 }];
    for (const { p: q } of near) {
      if (used.has(q)) continue;
      const m = meters([p.lng, p.lat], [q.lng, q.lat]);
      if (m <= WALK) { used.add(q); around.push({ q, m }); }
    }
    let mask = 0;
    const services: Stop["services"] = [];
    needs.forEach((need, i) => {
      const hits = around.filter(({ q }) => q.mask & bits[i]);
      if (!hits.length) return;
      mask |= 1 << i;
      const best = hits.sort((a, b) => Number(!a.q.name) - Number(!b.q.name) || a.m - b.m)[0];
      services.push({ need, name: best.q.name, meters: Math.round(best.m) });
    });
    found.push({ stop: { lng: p.lng, lat: p.lat, mask, services }, d, n: services.length });
  }

  // The closest ones for each need, then those covering the most.
  const chosen = new Set<Stop>();
  const per = Math.floor(limit / 2 / needs.length);
  needs.forEach((_, i) => found.filter((x) => x.stop.mask & (1 << i)).slice(0, per).forEach((x) => chosen.add(x.stop)));
  for (const x of [...found].sort((a, b) => b.n - a.n || a.d - b.d)) {
    if (chosen.size >= limit) break;
    chosen.add(x.stop);
  }
  return [...chosen];
}
