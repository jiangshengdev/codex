import { createElement } from "react";
import { addons, types } from "storybook/manager-api";
import { DEV_VISIBILITY_ADDON } from "../src/storybook/devVisibility";
import { DevVisibilityTool } from "./DevVisibilityTool";

addons.register(DEV_VISIBILITY_ADDON, () => {
  addons.add(DEV_VISIBILITY_ADDON, {
    type: types.TOOL,
    title: "DEV",
    render: () => createElement(DevVisibilityTool),
  });
});
