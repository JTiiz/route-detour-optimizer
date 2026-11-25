import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { NEEDS, type Graph, type LngLat, type Plan, type Route } from "../core/types";

// The worker lives in its own file; without this Vite leaves it out of the build.
maplibregl.setWorkerUrl(workerUrl);

interface Props {
  route: Route | null;
  window: LngLat[];
  graph: Graph | null;
  plan: Plan | null;
  detour: LngLat[];
  onPick: (p: LngLat) => void;
}

const line = (coords: LngLat[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } });
const points = (coords: LngLat[]) => ({
  type: "FeatureCollection" as const,
  features: coords.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } })),
});

export default function MapView({ route, window: win, graph, plan, detour, onPick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: el.current!, style: "https://tiles.openfreemap.org/styles/positron",
        center: [-3.7, 40.2], zoom: 5, attributionControl: { compact: true },
      });
    } catch { return; } // without WebGL the list still works
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("click", (e) => pick.current([e.lngLat.lng, e.lngLat.lat]));
    m.on("load", () => {
      const add = (id: string, color: string, width: number, dash?: number[]) => {
        m.addSource(id, { type: "geojson", data: line([]) });
        m.addLayer({
          id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": color, "line-width": width, ...(dash ? { "line-dasharray": dash } : {}) },
        });
      };
      add("route", "#0a5c9e", 4);
      add("window", "#7db8ea", 10);
      add("route-top", "#0a5c9e", 3);
      add("detour", "#e85d1a", 5);
      m.addSource("stops", { type: "geojson", data: points([]) });
      m.addLayer({
        id: "stops", type: "circle", source: "stops",
        paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-stroke-color": "#0a5c9e", "circle-stroke-width": 1.5 },
      });
      setReady(true);
    });
    return () => { m.remove(); map.current = null; };
  }, []);

  const set = (id: string, data: any) => (map.current?.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);

  useEffect(() => {
    if (!ready) return;
    set("route", line(route?.coords ?? []));
    set("route-top", line(route?.coords ?? []));
    set("window", line(win));
    set("detour", line(detour));
    set("stops", points(graph?.stops.map((s): LngLat => [s.lng, s.lat]) ?? []));
  }, [ready, route, win, graph, detour]);

  useEffect(() => {
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const m = map.current;
    if (!m || !route) return;
    const put = (p: LngLat, cls: string, text: string) => {
      const d = document.createElement("div");
      d.className = `pin ${cls}`;
      d.textContent = text;
      markers.current.push(new maplibregl.Marker({ element: d }).setLngLat(p).addTo(m));
    };
    put(route.coords[0], "end", "A");
    put(route.coords[route.coords.length - 1], "end", "B");
    if (plan && graph) plan.stops.forEach((i) => {
      const s = graph.stops[i];
      put([s.lng, s.lat], "stop", s.services.map((x) => NEEDS.find((n) => n.id === x.need)!.icon).join(""));
    });
  }, [ready, route, plan, graph]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !route) return;
    const pts: LngLat[] = plan && graph
      ? [...plan.stops.map((i): LngLat => [graph.stops[i].lng, graph.stops[i].lat]), graph.anchors[plan.exit], graph.anchors[plan.rejoin]]
      : route.coords;
    const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => b.extend(p));
    m.fitBounds(b, { padding: 60, maxZoom: 14, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700 });
  }, [ready, route, plan, graph]);

  return <div ref={el} className="map" aria-label="Route map. Tap the route to choose where to stop." />;
}
