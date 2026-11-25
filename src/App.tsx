import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import PlaceInput from "./components/PlaceInput";
import { DEMOS, type Demo, type DemoData } from "./core/demos";
import { findPlans } from "./core/dijkstra";
import { nearestTime, sliceRoute } from "./core/geo";
import { appleMaps, googleMaps, waze } from "./core/links";
import { buildGraph, HALF_WINDOW } from "./core/planner";
import { fetchRoute, type Place } from "./core/services";
import { parseShared } from "./core/share";
import { MAX_NEEDS, NEEDS, type Graph, type LngLat, type NeedId, type Plan, type Route } from "./core/types";

const BASE = import.meta.env.BASE_URL;
const need = (id: NeedId) => NEEDS.find((n) => n.id === id)!;

function hm(s: number) {
  const min = Math.round(s / 60), h = Math.floor(min / 60);
  return h ? `${h} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
}
const extraText = (s: number) => (s < 60 ? "< 1 min" : `+${Math.round(s / 60)} min`);

// What another app shared, read once and then removed from the address bar.
const shared = parseShared(new URLSearchParams(location.search));
if (location.search) history.replaceState(null, "", location.pathname);

interface Result { graph: Graph; plans: Plan[]; ms: number; needs: NeedId[] }

function solve(graph: Graph, needs: NeedId[]): Result {
  const t = performance.now();
  const plans = graph.stops.length ? findPlans(graph, needs.length) : [];
  return { graph, plans, ms: performance.now() - t, needs };
}

export default function App() {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(shared?.place ?? null);
  const [needs, setNeeds] = useState<NeedId[]>(["fuel", "food"]);
  const [route, setRoute] = useState<Route | null>(null);
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [chosen, setChosen] = useState(0);
  const [detour, setDetour] = useState<LngLat[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const results = useRef<HTMLElement>(null);

  // From the current position, the maps app can start navigating straight away.
  const origin = from && !from.here ? from.point : undefined;
  const plan = result?.plans[chosen] ?? null;

  function begin(label: string) {
    job.current?.abort();
    job.current = new AbortController();
    setBusy(label); setError(""); setResult(null); setDetour([]); setChosen(0);
    return job.current.signal;
  }

  function fail(e: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    console.error(e);
    setBusy("");
    setError(navigator.onLine
      ? "The public routing service is not responding right now. Try again in a minute or open an example."
      : "You are offline. Examples you have already opened still work.");
  }

  function dropRoute() {
    job.current?.abort();
    setBusy(""); setError(""); setRoute(null); setResult(null); setDetour([]);
  }

  async function trace() {
    if (!from || !to) return;
    const signal = begin("Drawing the route…");
    try {
      const r = await fetchRoute([from.point, to.point], signal);
      if (signal.aborted) return;
      setRoute(r);
      setAt(Math.min(r.duration / 2, 2 * 3600));
      setBusy("");
    } catch (e) { fail(e, signal); }
  }

  async function search() {
    if (!route || !needs.length) return;
    const signal = begin("Measuring detours by road…");
    try {
      const graph = await buildGraph(route, at, needs, BASE, signal);
      if (signal.aborted) return;
      setResult(solve(graph, needs));
      setBusy("");
    } catch (e) { fail(e, signal); }
  }

  async function openDemo(d: Demo) {
    const signal = begin("Opening example…");
    try {
      const res = await fetch(`${BASE}demo/${d.id}.json`, { signal });
      if (!res.ok) throw new Error(`demo ${res.status}`);
      const data: DemoData = await res.json();
      if (signal.aborted) return;
      setFrom(d.from); setTo(d.to); setNeeds(d.needs);
      setRoute(data.route); setAt(d.at);
      setResult(solve(data.graph, d.needs));
      setBusy("");
    } catch (e) { fail(e, signal); }
  }

  function toggle(id: NeedId) {
    setNeeds((n) => (n.includes(id) ? n.filter((x) => x !== id) : n.length < MAX_NEEDS ? [...n, id] : n));
    stale();
  }

  function stale() {
    job.current?.abort();
    setBusy(""); setResult(null); setDetour([]);
  }

  function moveAt(t: number) { setAt(t); stale(); }

  // Real detour geometry; if it fails, straight lines are kept.
  useEffect(() => {
    if (!plan || !result) return;
    const g = result.graph;
    const pts: LngLat[] = [g.anchors[plan.exit], ...plan.stops.map((i): LngLat => [g.stops[i].lng, g.stops[i].lat]), g.anchors[plan.rejoin]];
    setDetour(pts);
    const ctl = new AbortController();
    fetchRoute(pts, ctl.signal).then((r) => setDetour(r.coords)).catch(() => {});
    return () => ctl.abort();
  }, [plan, result]);

  useEffect(() => { if (result) results.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [result]);

  const win = useMemo(
    () => (route ? sliceRoute(route, Math.max(0, at - HALF_WINDOW), Math.min(route.duration, at + HALF_WINDOW)) : []),
    [route, at],
  );

  return (
    <div className="app">
      <MapView route={route} window={win} graph={result?.graph ?? null} plan={plan} detour={detour}
        onPick={(p) => route && moveAt(nearestTime(route, p))} />

      <main className="panel">
        <header>
          <h1>Route Detour Optimizer</h1>
          <p>Say what you need on the trip and find the stop that costs you the least time.</p>
        </header>

        <section aria-label="Examples" className="demos">
          {DEMOS.map((d) => (
            <button key={d.id} onClick={() => openDemo(d)}>
              <span aria-hidden>{d.icon}</span>
              <span><b>{d.title}</b><small>{d.from.label} → {d.to.label}</small></span>
            </button>
          ))}
        </section>

        <section>
          <h2>Your route</h2>
          <PlaceInput label="From" placeholder="City or address" value={from} locate onChange={(p) => { setFrom(p); dropRoute(); }} />
          <PlaceInput label="To" lookup={shared?.queries} placeholder="City or address" value={to} onChange={(p) => { setTo(p); dropRoute(); }} />
          {shared && !shared.place && !shared.queries.length && !to && (
            <p className="note">The shared link does not say which place it is. Type the destination.</p>
          )}
          {!route && <button className="primary" disabled={!from || !to || !!busy} onClick={trace}>Draw route</button>}
          {route && <p className="summary">{Math.round(route.distance / 1000)} km · {hm(route.duration)} without stops</p>}
        </section>

        <section>
          <h2 id="needs">What do you need? <small>up to {MAX_NEEDS}</small></h2>
          <div className="chips" role="group" aria-labelledby="needs">
            {NEEDS.map((n) => {
              const on = needs.includes(n.id);
              return (
                <button key={n.id} aria-pressed={on} disabled={!on && needs.length >= MAX_NEEDS} onClick={() => toggle(n.id)}>
                  <span aria-hidden>{n.icon}</span> {n.label}
                </button>
              );
            })}
          </div>
        </section>

        {route && (
          <section>
            <h2><label htmlFor="at">When do you want to stop?</label></h2>
            <input id="at" type="range" min={0} max={Math.round(route.duration)} step={60} value={Math.round(at)}
              aria-valuetext={`${hm(at)} after leaving`} onChange={(e) => moveAt(+e.target.value)} />
            <p className="summary">About <b>{hm(at)}</b> after leaving (±25 min). You can also tap the route on the map.</p>
            <button className="primary" disabled={!needs.length || !!busy} onClick={search}>Find the best stop</button>
          </section>
        )}

        <div role="status" aria-live="polite">{busy && <p className="busy">{busy}</p>}</div>
        {error && <p className="error" role="alert">{error}</p>}

        {result && (
          <section ref={results} className="results">
            <h2>{result.plans.length ? "Where to stop" : "No stop covers everything"}</h2>
            {!result.plans.length && (
              <p>Nothing within 5 km of this stretch covers everything you chose. Change the time or drop a need.</p>
            )}
            {result.plans.length > 0 && <p className="summary">Extra driving minutes. The ranking also counts 4 min of parking per stop.</p>}
            {result.plans.map((p, i) => {
              const via = p.stops.map((k): LngLat => [result.graph.stops[k].lng, result.graph.stops[k].lat]);
              return (
                <article key={i} className={i === chosen ? "plan on" : "plan"}>
                  <button className="plan-head" aria-expanded={i === chosen} onClick={() => setChosen(i)}>
                    <span className="extra">{extraText(p.extra)}</span>
                    <span>{i === 0 ? "Best option" : Math.round(p.extra / 60) < Math.round(result.plans[0].extra / 60) ? "Shorter detour, more stops" : "Alternative"} · {p.stops.length === 1 ? "1 stop" : `${p.stops.length} stops`}</span>
                  </button>
                  {i === chosen && (
                    <>
                      <ol>
                        {p.stops.map((k) => (
                          <li key={k}>
                            {result.graph.stops[k].services.map((s) => (
                              <div key={s.need}>
                                <span aria-hidden>{need(s.need).icon}</span> {s.name || need(s.need).label}
                                {s.meters > 20 && <small> {s.meters} m away</small>}
                              </div>
                            ))}
                          </li>
                        ))}
                      </ol>
                      <div className="nav">
                        {to && <a href={googleMaps(to.point, via, origin)} target="_blank" rel="noreferrer">Google Maps</a>}
                        {to && <a href={appleMaps(to.point, via, origin)} target="_blank" rel="noreferrer">Apple Maps</a>}
                        <a href={waze(via)} target="_blank" rel="noreferrer">Waze</a>
                      </div>
                      <small>Waze only takes one destination per link: it goes to the first stop.</small>
                    </>
                  )}
                </article>
              );
            })}
            {result.plans.length > 0 && (
              <details>
                <summary>How it was worked out</summary>
                <p>
                  Dijkstra explored {result.plans.reduce((a, p) => a + p.explored, 0)} states
                  across {result.graph.anchors.length} route points and {result.graph.stops.length} stops
                  in {result.ms < 1 ? "under 1" : Math.round(result.ms)} ms, returning {result.plans.length === 1 ? "one option" : `${result.plans.length} options`}.
                </p>
                <p>
                  Each state is a place plus the needs already covered ({result.needs.map((n) => need(n).label.toLowerCase()).join(", ")}).
                  That way it decides at once where to stop, where to leave and where to rejoin. Each stop adds 4 min of
                  parking when comparing, so one that has it all usually beats several.
                </p>
              </details>
            )}
          </section>
        )}

        <footer>
          <p>
            OSRM times, without live traffic. Check opening hours before you go. When you search, addresses are sent to
            Photon and route points to OSRM; this site stores no trips.
          </p>
          <p>Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Map <a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://project-osrm.org">OSRM</a> · <a href="https://photon.komoot.io">Photon</a></p>
        </footer>
      </main>
    </div>
  );
}
