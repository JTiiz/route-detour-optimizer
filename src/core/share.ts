import type { Place } from "./services";
import type { LngLat } from "./types";

/** A place shared from another app: exact when it carries coordinates, else texts to search for. */
export interface Shared { place: Place | null; queries: string[] }

const NUM = String.raw`(-?\d{1,3}\.\d+)`;
const PAIRS = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`), // Google Maps: the place itself
  new RegExp(String.raw`[?&](?:destination|daddr|coordinate|query|q|ll|sll)=(?:loc:)?${NUM},\s*${NUM}`),
  new RegExp(String.raw`^geo:${NUM},${NUM}`),
  new RegExp(String.raw`@${NUM},${NUM}`), // map centre: the least precise
];

function decode(s: string) {
  try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; }
}

function coordinates(text: string): LngLat | null {
  for (const re of PAIRS) {
    const m = re.exec(text);
    if (!m) continue;
    const lat = +m[1], lng = +m[2];
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) return [lng, lat];
  }
  return null;
}

/** Reads the title, text and url that the system share sheet passes to the app. */
export function parseShared(params: URLSearchParams): Shared | null {
  const raw = ["title", "text", "url"].map((k) => params.get(k)?.trim() ?? "").filter(Boolean);
  if (!raw.length) return null;
  const all = raw.join("\n").slice(0, 2000);

  const links = all.match(/(?:https?:\/\/|geo:)\S+/g) ?? [];
  let point: LngLat | null = null;
  let named = "";
  for (const link of links) {
    point ??= coordinates(link) ?? coordinates(decode(link));
    named ||= decode(/\/maps\/(?:place|search)\/([^/@?]+)/.exec(link)?.[1] ?? "");
  }

  const lines = [...new Set(all.replace(/(?:https?:\/\/|geo:)\S+/g, "").split("\n").map((l) => l.trim()).filter(Boolean))];
  const isPair = (s: string) => /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(s);
  if (!point) {
    const pair = lines.find(isPair);
    if (pair) { const [lat, lng] = pair.split(",").map(Number); point = [lng, lat]; }
  }
  const texts = [...lines, named].filter((s) => s && !isPair(s));

  if (point) return { place: { label: texts[0] ?? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}`, point }, queries: [] };
  // Most specific first: "name, address", then the address, then the name.
  return { place: null, queries: [...new Set([texts.join(", "), ...texts.slice().reverse()])].filter((s) => s.length >= 3) };
}
