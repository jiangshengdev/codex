import { createRootRoute, createRoute, type Router } from "@tanstack/react-router";

const rootRoute = createRootRoute();
const previewRoute = createRoute({ getParentRoute: () => rootRoute, path: "$" });
// The Storybook framework clones this tree and owns its per-story memory router.
export const statefulPreviewRouteTree = rootRoute.addChildren([previewRoute]);
export type StatefulPreviewRouter = Router<typeof statefulPreviewRouteTree>;
