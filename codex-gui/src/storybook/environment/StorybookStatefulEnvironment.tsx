import { useState, type PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { makeStore, type RootState } from "@/app/store";

type StatefulEnvironmentProps = PropsWithChildren<{
  storyId: string;
  preloadedState?: Partial<RootState>;
}>;

function StatefulEnvironment({ children, preloadedState }: StatefulEnvironmentProps) {
  const [store] = useState(() => makeStore(preloadedState));
  return <Provider store={store}>{children}</Provider>;
}

/** Opt in below the shared theme/language environment; each story owns its state and history. */
export function StorybookStatefulEnvironment(props: StatefulEnvironmentProps) {
  return <StatefulEnvironment key={props.storyId} {...props} />;
}
