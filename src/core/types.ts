export type LngLat = [number, number];

export const NEEDS = [
  { id: "fuel", icon: "⛽", label: "Fuel" },
  { id: "ev", icon: "🔌", label: "EV charging" },
  { id: "food", icon: "🍽️", label: "Food" },
  { id: "glutenfree", icon: "🌾", label: "Gluten-free" },
  { id: "coffee", icon: "☕", label: "Coffee" },
  { id: "toilets", icon: "🚻", label: "Toilets" },
  { id: "playground", icon: "🛝", label: "Playground" },
  { id: "supermarket", icon: "🛒", label: "Supermarket" },
  { id: "hotel", icon: "🛏️", label: "Sleep" },
  { id: "rest", icon: "🅿️", label: "Rest area" },
  { id: "truck", icon: "🚛", label: "Truck parking" },
  { id: "camper", icon: "🚐", label: "Campervan" },
] as const;

export type NeedId = (typeof NEEDS)[number]["id"];
export const MAX_NEEDS = 4;

/** Bit of a need inside the catalogue (same order as NEEDS and build-pois.mjs). */
export const bitOf = (id: NeedId) => 1 << NEEDS.findIndex((n) => n.id === id);

export interface Poi { lng: number; lat: number; mask: number; name: string }

export interface Route {
  coords: LngLat[];
  /** Cumulative seconds from the origin at each vertex. */
  cum: number[];
  duration: number;
  distance: number;
}

/** A place to stop: a point to drive to and what is within walking distance. */
export interface Stop {
  lng: number;
  lat: number;
  /** Local bits (position in the list of chosen needs). */
  mask: number;
  services: { need: NeedId; name: string; meters: number }[];
}

export interface Graph {
  /** Points on the route and their cumulative time (s). */
  anchors: LngLat[];
  anchorTimes: number[];
  stops: Stop[];
  /** Matrix of driving seconds: anchors first, then stops. */
  durations: (number | null)[][];
}

export interface Plan { stops: number[]; extra: number; exit: number; rejoin: number; explored: number }
