import { demoRouteFixtures } from "./fixtures";
import type { RouteOption, RoutingProvider } from "./types";

export class DemoRoutingProvider implements RoutingProvider {
  async getRoutes(originSuburbId: string, campusId: string): Promise<RouteOption[]> {
    const key = `${originSuburbId}:${campusId}`;
    return demoRouteFixtures[key] ?? [];
  }
}

export function chooseRecommendedRoute(
  routes: RouteOption[],
  preference: "car" | "public_transport" | "either" = "either",
): RouteOption | undefined {
  const eligible = preference === "either"
    ? routes
    : routes.filter((route) =>
        preference === "car" ? route.mode === "driving" : route.mode === "public_transport",
      );

  return [...eligible].sort((a, b) => {
    if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes;
    return a.transfers - b.transfers;
  })[0];
}
