// Downloads services in Spain from OpenStreetMap (via QLever) and splits them into tiles.
// Usage: npm run data:pois     Data © OpenStreetMap contributors, ODbL.
import { mkdir, rm, writeFile } from "node:fs/promises";

const is = (k, v) => `?o osmkey:${k} "${v}" .`;
const any = (k, vs) => `VALUES ?v { ${vs.map((v) => `"${v}"`).join(" ")} } ?o osmkey:${k} ?v .`;
const GF = "<https://www.openstreetmap.org/wiki/Key:diet:gluten_free>";

// Same order as NEEDS in src/core/types.ts
const queries = [
  is("amenity", "fuel"),
  is("amenity", "charging_station"),
  any("amenity", ["restaurant", "fast_food"]),
  `VALUES ?v { "yes" "only" } ?o ${GF} ?v . VALUES ?a { "restaurant" "fast_food" "cafe" "bar" } ?o osmkey:amenity ?a .`,
  is("amenity", "cafe"),
  is("amenity", "toilets"),
  is("leisure", "playground"),
  is("shop", "supermarket"),
  any("tourism", ["hotel", "motel"]),
  any("highway", ["rest_area", "services"]),
  `${is("amenity", "parking")} VALUES ?v { "yes" "designated" } ?o osmkey:hgv ?v .`,
  any("tourism", ["caravan_site"]),
];

const prefix = `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>`;

const pois = new Map();
for (const [i, where] of queries.entries()) {
  const query = `${prefix}
SELECT ?o (SAMPLE(?nm) AS ?name) (SAMPLE(?c) AS ?pt) WHERE {
  osmrel:1311341 ogc:sfContains ?o . ${where}
  ?o geo:hasGeometry/geo:asWKT ?g . BIND(geof:centroid(?g) AS ?c)
  OPTIONAL { ?o osmkey:name ?nm }
} GROUP BY ?o`;
  const res = await fetch("https://qlever.dev/api/osm-planet", {
    method: "POST",
    body: new URLSearchParams({ query }),
    headers: { Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`Query ${i}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const rows = (await res.json()).results.bindings;
  if (!rows.length) throw new Error(`Query ${i} is empty`);
  for (const r of rows) {
    const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(r.pt?.value ?? "");
    if (!m) continue;
    const p = pois.get(r.o.value) ?? { lng: +(+m[1]).toFixed(5), lat: +(+m[2]).toFixed(5), mask: 0, name: r.name?.value ?? "" };
    p.mask |= 1 << i;
    pois.set(r.o.value, p);
  }
  console.log(i, rows.length);
}

const out = new URL("../public/pois/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const tiles = new Map();
for (const p of pois.values()) {
  const k = `${Math.floor(p.lng * 2)}_${Math.floor(p.lat * 2)}`;
  if (!tiles.has(k)) tiles.set(k, []);
  tiles.get(k).push([p.lng, p.lat, p.mask, p.name]);
}
for (const [k, v] of tiles) await writeFile(new URL(`${k}.json`, out), JSON.stringify(v));
await writeFile(new URL("index.json", out), JSON.stringify([...tiles.keys()]));
console.log(`${pois.size} places in ${tiles.size} tiles`);
