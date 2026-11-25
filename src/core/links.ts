import type { LngLat } from "./types";

const ll = ([x, y]: LngLat) => `${y.toFixed(6)},${x.toFixed(6)}`;

/** Without `from`, the maps app starts from the current position. */
export const googleMaps = (to: LngLat, via: LngLat[], from?: LngLat) =>
  `https://www.google.com/maps/dir/?api=1${from ? `&origin=${encodeURIComponent(ll(from))}` : ""}&destination=${encodeURIComponent(ll(to))}&waypoints=${encodeURIComponent(via.map(ll).join("|"))}&travelmode=driving`;

export const appleMaps = (to: LngLat, via: LngLat[], from?: LngLat) =>
  `https://maps.apple.com/directions?${from ? `source=${ll(from)}&` : ""}destination=${ll(to)}${via.map((v) => `&waypoint=${ll(v)}`).join("")}&mode=driving`;

/** Waze documents a single destination per link, so it opens the first stop. */
export const waze = (via: LngLat[]) => `https://waze.com/ul?ll=${encodeURIComponent(ll(via[0]))}&navigate=yes`;
