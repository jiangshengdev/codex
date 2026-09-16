import * as React from "react";
import { IconButton } from "storybook/internal/components";
import { addons, useAddonState, useChannel } from "storybook/manager-api";
import {
  defaultDevVisibility,
  DEV_VISIBILITY_ADDON,
  DEV_VISIBILITY_CHANGED,
  DEV_VISIBILITY_REQUEST,
  type DevVisibility,
} from "../src/storybook/devVisibility";

export function DevVisibilityTool() {
  const [visibility, setVisibility] = useAddonState<DevVisibility>(
    DEV_VISIBILITY_ADDON,
    defaultDevVisibility,
  );
  useChannel(
    {
      [DEV_VISIBILITY_REQUEST]: () => {
        addons.getChannel().emit(DEV_VISIBILITY_CHANGED, visibility);
      },
    },
    [visibility],
  );
  React.useEffect(() => {
    // Also synchronize when the toolbar mounts after a preview has requested state.
    addons.getChannel().emit(DEV_VISIBILITY_CHANGED, visibility);
  }, [visibility]);
  return (
    <IconButton
      title="Show DEV controls"
      aria-label="Show DEV controls"
      aria-pressed={visibility.visible}
      active={visibility.visible}
      onClick={() => {
        setVisibility({ visible: !visibility.visible }, { persistence: "none" });
      }}
    >
      DEV
    </IconButton>
  );
}
