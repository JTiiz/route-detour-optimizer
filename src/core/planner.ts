import { buildStops } from "./candidates";
import { pointAt, sliceRoute } from "./geo";
import { fetchMatrix, loadPois } from "./services";
import type { Graph, LngLat, NeedId, Route } from "./types";

/** Seconds searched on each side of the chosen moment. */
export const HALF_WINDOW = 25 * 60;
const ANCHORS = 24;

export async function buildGraph(
  route: Route, at: number, needs: NeedId[], base: string, signal?: AbortSignal, get?: (u: string) => Promise<any>,
): Promise<Graph> {
  const from = Math.max(0, at - HALF_WINDOW), to = Math.min(route.duration, at + HALF_WINDOW);
  const anchorTimes = Array.from({ length: ANCHORS }, (_, i) => from + ((to - from) * i) / (ANCHORS - 1));
  const anchors = anchorTimes.map((t) => pointAt(route, t));
  const line = sliceRoute(route, from, to);
  const stops = buildStops(await loadPois(line, base, get), line, needs);
  if (!stops.length) return { anchors, anchorTimes, stops, durations: [] };
  const points = [...anchors, ...stops.map((s): LngLat => [s.lng, s.lat])];
  return { anchors, anchorTimes, stops, durations: await fetchMatrix(points, signal) };
}
