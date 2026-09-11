import { Button, Spinner } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { use, useSyncExternalStore } from "react";
import { ThreadForkContext, ThreadForkSourceContext } from "./ThreadForkContext";
import type { ThreadForkOwner } from "./threadForkOwner";

export function ThreadForkAction({ turnId }: Readonly<{ turnId: string }>) {
  const context = use(ThreadForkContext);
  const threadId = use(ThreadForkSourceContext);
  if (context == null || threadId == null) return null;
  return (
    <ForkButton
      owner={context.owner}
      available={context.available}
      threadId={threadId}
      turnId={turnId}
    />
  );
}

function ForkButton({
  owner,
  available,
  threadId,
  turnId,
}: Readonly<{
  owner: ThreadForkOwner;
  available: boolean;
  threadId: string;
  turnId: string;
}>) {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const { t } = useLingui();
  const pending =
    snapshot.pending && snapshot.sourceThreadId === threadId && snapshot.lastTurnId === turnId;
  const label = t({
    comment:
      "Button at the end of a chat turn; creates a new conversation including history through this turn",
    message: "Fork from here",
  });
  return (
    <Button
      aria-label={label}
      className="justify-self-start"
      variant="secondary"
      size="sm"
      isDisabled={!available || snapshot.pending}
      isPending={pending}
      onPress={() => {
        void owner.fork(threadId, turnId);
      }}
    >
      {pending ? <Spinner color="current" size="sm" /> : null}
      {label}
    </Button>
  );
}
