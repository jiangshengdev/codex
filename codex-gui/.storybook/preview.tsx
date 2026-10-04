import type { Preview } from "@storybook/tanstack-react";
import { StorybookEnvironment } from "../src/storybook/environment/StorybookEnvironment";
import "./storybook.css";
import "./preview.css";

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <StorybookEnvironment hasFixedHeader={context.parameters.hasFixedHeader === true}>
        <Story />
      </StorybookEnvironment>
    ),
  ],
  parameters: {
    options: {
      storySort: {
        order: [
          "App shell",
          [
            "Navigation",
            ["States"],
            "Shortcuts",
            ["Menu and focus", "Task switching"],
            "Active tasks",
            ["States"],
            "QR access",
            ["States"],
            "Not found",
            ["Navigation"],
          ],
          "Composer",
          [
            "Shortcuts",
            ["Send and newline", "Guide"],
            "Input and drafts",
            ["Input", "Draft"],
            "Send controls",
            ["Send", "Stop", "Guide", "Queue"],
            "Attachments",
            ["Files", "Images", "Mixed", "Failures"],
            "Pending input",
            ["Browsing", "Editing", "Reordering", "Recovery"],
          ],
          "Transcript",
          [
            "Basic messages",
            ["Messages", "Long user message"],
            "Agent questions",
            [
              "Daily answers",
              ["Plain Text", "Options", "Multiple"],
              "Turn and queue",
              ["Idle", "Queued"],
              "Recovery and history",
              ["Disconnected", "History"],
            ],
            "Rich content",
            ["Formatting", "Images", "Mixed"],
            "Execution",
            ["Activity"],
          ],
          "Recovery",
          [
            "Connection recovery",
            ["States", "Interactions", "Pages"],
            "Message synchronization",
            ["States"],
            "Task recovery",
            ["States"],
          ],
          "Environment",
          ["Rendering", ["Preview"], "Stateful", ["Store and router"]],
          "History",
          "New session",
          [
            "Shortcuts",
            ["Open draft"],
            "Flow",
            ["States (local simulation)"],
            "Inputs",
            ["Variants (local simulation)"],
            "Mixed input recovery",
            ["States (local simulation)"],
          ],
        ],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
};

export default preview;
