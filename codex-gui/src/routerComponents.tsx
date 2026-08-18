import { SearchParamError, type ErrorComponentProps, useMatches } from "@tanstack/react-router";
import App from "./App";
import { NotFoundPage } from "./NotFoundPage";
import { selectGuiRouteTarget } from "./features/browserLaunch/guiRouteTarget";

export function RootRouteError({ error }: ErrorComponentProps) {
  if (error instanceof SearchParamError) {
    return <NotFoundPage />;
  }
  throw error;
}

export function AppRouteBoundary() {
  const target = useMatches({ select: selectGuiRouteTarget });
  return target == null ? <NotFoundPage /> : <App routeTarget={target} />;
}
