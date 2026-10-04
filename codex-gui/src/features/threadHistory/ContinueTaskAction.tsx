import { Surface, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ActiveThreadActivationFailure,
  ActiveThreadActivationWarning,
  ActiveThreadSession,
} from "@/features/activeThreadSession/activeThreadSession";
import {
  CURRENT_TASK_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import { ContinueTaskFailureAlert } from "./ContinueTaskFailureAlert";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import { TaskBottomRegion } from "@/features/taskLayout/TaskBottomRegion";

type ContinueTaskFailure =
  | Readonly<{ type: "empty"; capabilityToken: symbol }>
  | Readonly<{
      type: "unavailable";
      capabilityToken: symbol;
      failure: ActiveThreadActivationFailure;
    }>
  | Readonly<{
      type: "unexpectedFailure";
      capabilityToken: symbol;
      error: unknown;
      readyThreadId?: string;
    }>;

type ContinueTaskState =
  | Readonly<{ type: "idle" }>
  | Readonly<{ type: "pending"; capabilityToken: symbol; failure: ContinueTaskFailure | null }>
  | ContinueTaskFailure;

type ContinueTaskRequest = Readonly<{
  capabilityToken: symbol;
}>;

export function ContinueTaskAction({
  activateThread,
  authorizationToken,
  routeTarget,
  threadId,
}: Readonly<{
  activateThread: ActiveThreadSession["activate"] | null;
  authorizationToken: string | null;
  routeTarget: GuiRouteTarget;
  threadId: string;
}>) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const failureDescriptionId = useId();
  const warningMessages: ActivationWarningMessages = {
    authorizationPersistenceFailed: {
      title: t`Task opened`,
      description: t`The task opened, but some state synchronization did not finish.`,
    },
    previousOwnerCleanupFailed: {
      title: t`Task opened`,
      description: t`The previous task connection could not be fully cleaned up. Later state may be affected.`,
    },
  };
  const capability = useMemo(
    () => ({ activateThread, token: Symbol("activeThreadSession.activate capability") }),
    [activateThread],
  );
  const capabilityToken = capability.token;
  const currentCapabilityTokenRef = useRef(capabilityToken);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<ContinueTaskRequest | null>(null);
  const [state, setState] = useState<ContinueTaskState>({ type: "idle" });
  const visibleState =
    state.type === "idle" || state.capabilityToken === capabilityToken
      ? state
      : ({ type: "idle" } as const);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    currentCapabilityTokenRef.current = capabilityToken;
    if (inFlightRef.current != null && inFlightRef.current.capabilityToken !== capabilityToken) {
      inFlightRef.current = null;
    }

    return () => {
      if (inFlightRef.current?.capabilityToken === capabilityToken) {
        inFlightRef.current = null;
      }
    };
  }, [capabilityToken]);

  const navigateToReadyTask = (activeThreadId: string): Promise<void> => {
    return navigate({
      to: CURRENT_TASK_ROUTE_PATH,
      params: { threadId: activeThreadId },
      replace: true,
    });
  };

  const navigateToCurrentTask = (activeThreadId: string): void => {
    void navigate({
      to: CURRENT_TASK_ROUTE_PATH,
      params: { threadId: activeThreadId },
    });
  };

  const handleContinue = async (): Promise<void> => {
    if (
      capability.activateThread == null ||
      inFlightRef.current?.capabilityToken === capabilityToken
    ) {
      return;
    }

    const previousFailure =
      visibleState.type === "idle" || visibleState.type === "pending" ? null : visibleState;
    const request: ContinueTaskRequest = { capabilityToken };
    inFlightRef.current = request;
    let readyThreadId =
      previousFailure?.type === "unexpectedFailure" ? previousFailure.readyThreadId : undefined;

    try {
      if (readyThreadId == null) {
        const switching = capability.activateThread(threadId);
        let settled = false;
        void switching.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        queueMicrotask(() => {
          if (
            !settled &&
            mountedRef.current &&
            currentCapabilityTokenRef.current === capabilityToken &&
            inFlightRef.current === request
          ) {
            setState({ type: "pending", capabilityToken, failure: previousFailure });
          }
        });

        const outcome = await switching;
        if (
          !mountedRef.current ||
          currentCapabilityTokenRef.current !== capabilityToken ||
          inFlightRef.current !== request
        ) {
          return;
        }
        switch (outcome.type) {
          case "ready":
            readyThreadId = outcome.threadId;
            for (const warning of outcome.warnings) {
              showActivationWarning(warning, warningMessages);
            }
            break;
          case "unavailable":
            setState({ type: "unavailable", capabilityToken, failure: outcome.failure });
            return;
          case "empty":
            setState({ type: "empty", capabilityToken });
            return;
          default:
            return outcome satisfies never;
        }
      }
      setState({ type: "pending", capabilityToken, failure: previousFailure });
      await navigateToReadyTask(readyThreadId);
      if (
        mountedRef.current &&
        currentCapabilityTokenRef.current === capabilityToken &&
        inFlightRef.current === request
      ) {
        setState({ type: "idle" });
      }
    } catch (error: unknown) {
      if (
        mountedRef.current &&
        currentCapabilityTokenRef.current === capabilityToken &&
        inFlightRef.current === request
      ) {
        setState({
          type: "unexpectedFailure",
          capabilityToken,
          error,
          ...(readyThreadId == null ? {} : { readyThreadId }),
        });
      }
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  };

  return (
    <TaskBottomRegion as="aside" placement="fixed">
      <Surface className="task-bottom-panel grid gap-3" variant="default">
        <ContinueTaskFailureAlert
          descriptionId={failureDescriptionId}
          navigateToCurrentTask={navigateToCurrentTask}
          state={
            visibleState.type === "pending" ? (visibleState.failure ?? visibleState) : visibleState
          }
        />
        <div className="flex items-center gap-2">
          <QrAccessPopover authorizationToken={authorizationToken} routeTarget={routeTarget} />
          <RetryActionButton
            aria-describedby={
              visibleState.type === "idle" ||
              (visibleState.type === "pending" && visibleState.failure == null)
                ? undefined
                : failureDescriptionId
            }
            className="flex-1"
            isDisabled={capability.activateThread == null}
            isPending={visibleState.type === "pending"}
            pendingChildren={<Trans>Continuing this task…</Trans>}
            onPress={() => {
              void handleContinue();
            }}
            variant="primary"
          >
            <Trans>Continue this task</Trans>
          </RetryActionButton>
        </div>
      </Surface>
    </TaskBottomRegion>
  );
}

type ActivationWarningMessages = Readonly<
  Record<
    ActiveThreadActivationWarning["type"],
    Readonly<{
      title: string;
      description: string;
    }>
  >
>;

function showActivationWarning(
  warning: ActiveThreadActivationWarning,
  messages: ActivationWarningMessages,
): void {
  switch (warning.type) {
    case "authorizationPersistenceFailed":
      toast.warning(messages.authorizationPersistenceFailed.title, {
        description: messages.authorizationPersistenceFailed.description,
      });
      return;
    case "previousOwnerCleanupFailed":
      toast.warning(messages.previousOwnerCleanupFailed.title, {
        description: messages.previousOwnerCleanupFailed.description,
      });
      return;
  }

  warning satisfies never;
}
