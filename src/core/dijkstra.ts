import type { Graph, Plan } from "./types";

/** Binary min-heap: Dijkstra's priority queue. */
export class MinHeap {
  private a: { key: number; id: number }[] = [];
  get size() { return this.a.length; }

  push(key: number, id: number) {
    const a = this.a;
    let i = a.push({ key, id }) - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].key <= a[i].key) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].key < a[m].key) m = l;
        if (r < a.length && a[r].key < a[m].key) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export const STOP_PENALTY = 240;

/**
 * Dijkstra over states (place, needs already covered).
 *
 * Plain Dijkstra only remembers where it is. Here each place appears once per
 * combination of covered needs, so the shortest path to (end of the stretch,
 * everything covered) decides at once which stops to make, in which order,
 * where to leave the route and where to rejoin it.
 *
 * `stopPenalty` (s) is the cost of parking: it favours one stop that has it
 * all over several. It is not included in `extra`.
 */
export function findPlan(
  g: Graph, needCount: number, stopPenalty = STOP_PENALTY, banned: ReadonlySet<number> = new Set(),
): Plan | null {
  const A = g.anchors.length;
  const N = A + g.stops.length;
  const M = 1 << needCount;
  const full = M - 1;
  const dist = new Float64Array(N * M).fill(Infinity);
  const prev = new Int32Array(N * M).fill(-1);
  const done = new Uint8Array(N * M);
  const heap = new MinHeap();
  const goal = (A - 1) * M + full;

  const relax = (from: number, node: number, mask: number, d: number) => {
    const s = node * M + mask;
    if (d < dist[s]) { dist[s] = d; prev[s] = from; heap.push(d, s); }
  };

  dist[0] = 0;
  heap.push(0, 0);
  let explored = 0;

  while (heap.size) {
    const { id: s } = heap.pop();
    if (done[s]) continue;
    done[s] = 1;
    explored++;
    if (s === goal) break;

    const node = Math.floor(s / M), mask = s % M, d = dist[s];

    // Keep driving along the route.
    if (node + 1 < A) relax(s, node + 1, mask, d + g.anchorTimes[node + 1] - g.anchorTimes[node]);

    // Go to a stop that adds something new.
    for (let k = 0; k < g.stops.length; k++) {
      if (banned.has(k) || A + k === node) continue;
      const next = mask | g.stops[k].mask;
      const t = g.durations[node][A + k];
      if (next !== mask && t != null) relax(s, A + k, next, d + t + stopPenalty);
    }

    // From a stop, rejoin the route at any point.
    if (node >= A) for (let j = 0; j < A; j++) {
      const t = g.durations[node][j];
      if (t != null) relax(s, j, mask, d + t);
    }
  }

  if (!Number.isFinite(dist[goal])) return null;

  const path: number[] = [];
  for (let s = goal; s >= 0; s = prev[s]) path.push(Math.floor(s / M));
  path.reverse();
  const first = path.findIndex((n) => n >= A);
  if (first < 0) return null;
  let last = first;
  path.forEach((n, i) => { if (n >= A) last = i; });
  const stops = path.filter((n) => n >= A).map((n) => n - A);
  const base = g.anchorTimes[A - 1] - g.anchorTimes[0];

  // When options tie within seconds, draw the latest exit and the earliest rejoin.
  let exit = path[first - 1], rejoin = path[last + 1];
  const a = path[first], z = path[last], TIE = 60;
  const outCost = (i: number) => (g.durations[i][a] ?? Infinity) + g.anchorTimes[i];
  const backCost = (j: number) => (g.durations[z][j] ?? Infinity) - g.anchorTimes[j];
  const outBest = outCost(exit), backBest = backCost(rejoin);
  for (let i = A - 1; i > exit; i--) if (outCost(i) <= outBest + TIE) { exit = i; break; }
  for (let j = 0; j < rejoin; j++) if (backCost(j) <= backBest + TIE) { rejoin = j; break; }

  return {
    stops,
    extra: Math.max(0, dist[goal] - stops.length * stopPenalty - base),
    exit,
    rejoin,
    explored,
  };
}

/** The best plan plus alternatives that reuse none of its stops. */
export function findPlans(g: Graph, needCount: number, count = 3): Plan[] {
  const banned = new Set<number>();
  const plans: Plan[] = [];
  while (plans.length < count) {
    const p = findPlan(g, needCount, STOP_PENALTY, banned);
    if (!p) break;
    plans.push(p);
    p.stops.forEach((s) => banned.add(s));
  }
  return plans;
}
