import { useEffect, useState, type PropsWithChildren } from "react";
import { addons } from "storybook/preview-api";
import {
  defaultDevVisibility,
  DEV_VISIBILITY_CHANGED,
  DEV_VISIBILITY_REQUEST,
  type DevVisibility,
} from "./devVisibility";

import { DevVisibilityContext } from "./devVisibilityContext";

export function DevVisibilityProvider({ children }: PropsWithChildren) {
  const [visibility, setVisibility] = useState(defaultDevVisibility);
  useEffect(() => {
    const channel = addons.getChannel();
    const receive = (value: DevVisibility) => {
      setVisibility(value);
    };
    channel.on(DEV_VISIBILITY_CHANGED, receive);
    channel.emit(DEV_VISIBILITY_REQUEST);
    return () => {
      channel.off(DEV_VISIBILITY_CHANGED, receive);
    };
  }, []);
  return <DevVisibilityContext value={visibility}>{children}</DevVisibilityContext>;
}
