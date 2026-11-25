import type { Graph, LngLat, NeedId, Route } from "./types";

export interface Demo {
  id: string;
  icon: string;
  title: string;
  from: { label: string; point: LngLat };
  to: { label: string; point: LngLat };
  needs: NeedId[];
  at: number;
}

export const DEMOS: Demo[] = [
  {
    id: "family", icon: "👨‍👩‍👧", title: "Family with kids",
    from: { label: "Bilbao", point: [-2.9253, 43.2627] }, to: { label: "Madrid", point: [-3.7038, 40.4168] },
    needs: ["fuel", "food", "playground"], at: 7200,
  },
  {
    id: "electric", icon: "🔌", title: "Electric and gluten-free",
    from: { label: "Barcelona", point: [2.1734, 41.3851] }, to: { label: "Valencia", point: [-0.3763, 39.4699] },
    needs: ["ev", "glutenfree"], at: 6600,
  },
  {
    id: "camper", icon: "🚐", title: "Campervan getaway",
    from: { label: "Madrid", point: [-3.7038, 40.4168] }, to: { label: "Alicante", point: [-0.4815, 38.3452] },
    needs: ["camper", "fuel", "supermarket"], at: 7200,
  },
];

export interface DemoData { route: Route; graph: Graph }
