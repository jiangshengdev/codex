import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useLocation } from "@tanstack/react-router";
import { NotFoundPage } from "@/NotFoundPage";
import { HISTORY_LIST_ROUTE_PATH } from "@/features/browserLaunch/guiRouteTarget";
import { statefulPreviewRouteTree } from "../environment/statefulPreviewRouter";

function NotFoundPreview() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return pathname === HISTORY_LIST_ROUTE_PATH ? (
    <main className="p-6">
      <code>{pathname}</code>
    </main>
  ) : (
    <NotFoundPage />
  );
}

const meta = {
  id: "app-shell-not-found",
  title: "App shell/Not found/Navigation",
  component: NotFoundPreview,
  parameters: {
    layout: "fullscreen",
    tanstack: { router: { route: statefulPreviewRouteTree, path: "/storybook-unmatched" } },
  },
} satisfies Meta<typeof NotFoundPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unmatched: Story = {};
