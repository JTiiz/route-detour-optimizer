import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStops } from "../src/core/candidates";
import { DEMOS } from "../src/core/demos";
import { findPlan, findPlans, MinHeap } from "../src/core/dijkstra";
import { metersToSegment, pointAt } from "../src/core/geo";
import { appleMaps, googleMaps, waze } from "../src/core/links";
import { bitOf, type Graph, type Poi } from "../src/core/types";

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomGraph(seed: number, A: number, S: number, needs: number): Graph {
  const r = rng(seed);
  const anchorTimes = [0];
  for (let i = 1; i < A; i++) anchorTimes.push(anchorTimes[i - 1] + 50 + r() * 100);
  const n = A + S;
  return {
    anchors: anchorTimes.map((_, i) => [i, 0]),
    anchorTimes,
    stops: Array.from({ length: S }, () => ({ lng: 0, lat: 0, mask: 1 + Math.floor(r() * (2 ** needs - 1)), services: [] })),
    durations: Array.from({ length: n }, () => Array.from({ length: n }, () => (r() < 0.1 ? null : 20 + r() * 600))),
  };
}

/** Optimal cost by repeated relaxation (Bellman-Ford), with no queue. */
function bruteForce(g: Graph, needs: number, penalty: number) {
  const A = g.anchors.length, N = A + g.stops.length, M = 1 << needs;
  const d = Array.from({ length: N }, () => new Array(M).fill(Infinity));
  d[0][0] = 0;
  for (let round = 0; round < N * M; round++) {
    let changed = false;
    for (let u = 0; u < N; u++) for (let m = 0; m < M; m++) for (let v = 0; v < N; v++) {
      if (u === v || d[u][m] === Infinity) continue;
      let w: number | null | undefined;
      if (v >= A) { const t = g.durations[u][v]; w = t == null ? null : t + penalty; }
      else if (u >= A) w = g.durations[u][v];
      else w = v === u + 1 ? g.anchorTimes[v] - g.anchorTimes[u] : null;
      if (w == null) continue;
      const nm = v >= A ? m | g.stops[v - A].mask : m;
      if (v >= A && nm === m) continue; // only stop where something is gained
      if (d[u][m] + w < d[v][nm] - 1e-9) { d[v][nm] = d[u][m] + w; changed = true; }
    }
    if (!changed) break;
  }
  return d[A - 1][M - 1];
}

describe("Dijkstra", () => {
  it("the heap returns keys in order", () => {
    const r = rng(7), h = new MinHeap(), keys = Array.from({ length: 200 }, r);
    keys.forEach((k, i) => h.push(k, i));
    const out: number[] = [];
    while (h.size) out.push(h.pop().key);
    expect(out).toEqual([...keys].sort((a, b) => a - b));
  });

  it("matches brute force on 200 random graphs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const needs = 1 + (seed % 4);
      const g = randomGraph(seed, 5, 7, needs);
      const best = bruteForce(g, needs, 100);
      const p = findPlan(g, needs, 100);
      if (!Number.isFinite(best)) { expect(p).toBeNull(); continue; }
      expect(p).not.toBeNull();
      const total = p!.extra + p!.stops.length * 100 + g.anchorTimes[4];
      // `extra` never drops below 0 even if the random graph has shortcuts.
      if (best - p!.stops.length * 100 >= g.anchorTimes[4]) expect(total).toBeCloseTo(best, 6);
      expect(p!.stops.reduce((m, s) => m | g.stops[s].mask, 0)).toBe(2 ** needs - 1);
    }
  });

  it("prefers one complete stop to two partial ones and never reuses stops", () => {
    const t = (n: number) => Array.from({ length: n }, () => new Array(n).fill(100));
    const stop = (mask: number) => ({ lng: 0, lat: 0, mask, services: [] });
    const g: Graph = { anchors: [[0, 0], [1, 0]], anchorTimes: [0, 100], stops: [stop(1), stop(2), stop(3)], durations: t(5) };
    expect(findPlans(g, 2).map((p) => [...p.stops].sort())).toEqual([[2], [0, 1]]);
  });

  it("returns null when nothing covers a need", () => {
    expect(findPlan({ ...randomGraph(1, 4, 0, 1), stops: [] }, 1)).toBeNull();
  });
});

describe("geometry and candidates", () => {
  it("measures distance to a segment and interpolates by time", () => {
    expect(metersToSegment([0.5, 0.01], [0, 0], [1, 0])).toBeCloseTo(1112, 0);
    expect(pointAt({ coords: [[0, 0], [2, 0]], cum: [0, 100], duration: 100, distance: 1 }, 25)).toEqual([0.5, 0]);
  });

  it("groups walkable services and drops far ones", () => {
    const poi = (lng: number, lat: number, mask: number): Poi => ({ lng, lat, mask, name: "x" });
    const stops = buildStops(
      [poi(0.5, 0.01, bitOf("fuel")), poi(0.501, 0.011, bitOf("food")), poi(0.5, 0.5, bitOf("fuel"))],
      [[0, 0], [1, 0]], ["fuel", "food"],
    );
    expect(stops).toHaveLength(1);
    expect(stops[0].mask).toBe(3);
  });
});

describe("links and examples", () => {
  it("Google and Apple keep destination and stops; Waze only the first stop", () => {
    expect(googleMaps([-3, 40], [[-2, 41], [-1, 42]])).toContain("destination=40.000000%2C-3.000000&waypoints=41.000000%2C-2.000000%7C42");
    expect(appleMaps([-3, 40], [[-2, 41]])).toContain("destination=40.000000,-3.000000&waypoint=41.000000,-2.000000");
    expect(waze([[-2, 41]])).toContain("ll=41.000000%2C-2.000000");
  });

  it.each(DEMOS)("example $id gives a sensible plan", (d) => {
    const { graph } = JSON.parse(readFileSync(`public/demo/${d.id}.json`, "utf8"));
    const plans = findPlans(graph, d.needs.length);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].extra).toBeLessThan(30 * 60);
  });
});
