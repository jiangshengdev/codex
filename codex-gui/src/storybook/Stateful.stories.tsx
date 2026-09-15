import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { makeStore } from "@/app/store";
import { createActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import { activeThreadReadModelSlotCreated } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import { HISTORY_DETAIL_ROUTE_PATH } from "@/features/browserLaunch/guiRouteTarget";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { statefulPreviewRouteTree, type StatefulPreviewRouter } from "./statefulPreviewRouter";
import { DevOnly } from "./DevOnly";

function StatefulPreview() {
  const dispatch = useAppDispatch();
  const count = useAppSelector((state) => Object.keys(state.threadRuntime.byThreadId).length);
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter<StatefulPreviewRouter>();

  return (
    <DevOnly>
      <p role="status">
        <Trans comment="Storybook environment check: count is the number of Redux read-model slots; pathname is an isolated preview route.">
          Redux slots: {count}; route: {pathname}
        </Trans>
      </p>
      <Button
        variant="primary"
        onPress={() => {
          dispatch(
            activeThreadReadModelSlotCreated(
              createActiveThreadSessionIdentity(`storybook-thread-${String(count)}`),
            ),
          );
        }}
      >
        <Trans comment="Storybook test action: creates an empty local Redux read-model slot without connecting to a backend.">
          Create read-model slot
        </Trans>
      </Button>
      <Button
        variant="secondary"
        onPress={() =>
          void router.navigate({
            to: HISTORY_DETAIL_ROUTE_PATH,
            params: { threadId: "storybook-preview" },
          })
        }
      >
        <Trans comment="Storybook test action: navigates only the isolated in-memory preview router.">
          Navigate to details
        </Trans>
      </Button>
    </DevOnly>
  );
}

const meta = {
  title: "Environment/Stateful",
  component: StatefulPreview,
  parameters: {
    tanstack: { router: { route: statefulPreviewRouteTree, path: "/" } },
  },
  decorators: [
    (Story, context) => {
      const seedStore = makeStore();
      if (context.name === "Seeded") {
        seedStore.dispatch(
          activeThreadReadModelSlotCreated(createActiveThreadSessionIdentity("storybook-seed")),
        );
      }
      return (
        <StorybookStatefulEnvironment storyId={context.id} preloadedState={seedStore.getState()}>
          <Story />
        </StorybookStatefulEnvironment>
      );
    },
  ],
} satisfies Meta<typeof StatefulPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Seeded: Story = {};
