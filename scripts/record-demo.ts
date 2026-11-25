// Records the example trips so the demo works even when OSRM is down.
// It also checks the Dijkstra result against a full route through the stops.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DEMOS } from "../src/core/demos";
import { findPlans } from "../src/core/dijkstra";
import { buildGraph } from "../src/core/planner";
import { fetchRoute } from "../src/core/services";
import type { LngLat } from "../src/core/types";

const root = new URL("../public/", import.meta.url);
const read = async (u: string) => JSON.parse(await readFile(new URL(u, root), "utf8"));
const pause = () => new Promise((r) => setTimeout(r, 1500)); // be gentle with the public server

await mkdir(new URL("demo/", root), { recursive: true });
for (const d of DEMOS) {
  const route = await fetchRoute([d.from.point, d.to.point]);
  await pause();
  const graph = await buildGraph(route, d.at, d.needs, "", undefined, read);
  const round = (c: LngLat): LngLat => [+c[0].toFixed(5), +c[1].toFixed(5)];
  await writeFile(new URL(`demo/${d.id}.json`, root), JSON.stringify({
    route: { ...route, coords: route.coords.map(round), cum: route.cum.map((x) => +x.toFixed(1)) }, graph,
  }));
  console.log(`\n${d.title}: ${graph.stops.length} candidate stops`);
  for (const p of findPlans(graph, d.needs.length)) {
    await pause();
    const via = p.stops.map((i): LngLat => [graph.stops[i].lng, graph.stops[i].lat]);
    const full = await fetchRoute([d.from.point, ...via, d.to.point]);
    console.log(
      `  Dijkstra +${(p.extra / 60).toFixed(1)} min · full route +${((full.duration - route.duration) / 60).toFixed(1)} min ·`,
      p.stops.map((i) => graph.stops[i].services.map((s) => `${s.need}:${s.name || "-"}`).join(", ")).join(" | "),
    );
  }
  await pause();
}
