import { Button, toast } from "@heroui/react";
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

type ContinueTaskState =
  | Readonly<{ type: "idle" }>
  | Readonly<{ type: "pending"; capabilityToken: symbol }>
  | Readonly<{ type: "empty"; capabilityToken: symbol }>
  | Readonly<{
      type: "unavailable";
      capabilityToken: symbol;
      failure: ActiveThreadActivationFailure;
    }>
  | Readonly<{ type: "unexpectedFailure"; capabilityToken: symbol; error: unknown }>;

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
  const actionSurfaceRef = useRef<HTMLElement | null>(null);
  const [actionSurfaceHeight, setActionSurfaceHeight] = useState(0);
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

  useLayoutEffect(() => {
    const actionSurface = actionSurfaceRef.current;
    if (actionSurface == null) {
      return;
    }

    let animationFrame: number | null = null;
    let pendingHeight: number | null = null;
    const commitActionSurfaceHeight = (): void => {
      animationFrame = null;
      const nextHeight = pendingHeight;
      pendingHeight = null;
      if (nextHeight == null) {
        return;
      }
      setActionSurfaceHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };
    const observer = new ResizeObserver((entries) => {
      const borderBoxSize = entries[0]?.borderBoxSize[0];
      if (borderBoxSize == null) {
        return;
      }
      pendingHeight = borderBoxSize.blockSize;
      animationFrame ??= window.requestAnimationFrame(commitActionSurfaceHeight);
    });
    observer.observe(actionSurface, { box: "border-box" });

    return () => {
      observer.disconnect();
      if (animationFrame != null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  const navigateToReadyTask = (activeThreadId: string): void => {
    void navigate({
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

    setState({ type: "idle" });
    const request: ContinueTaskRequest = { capabilityToken };
    inFlightRef.current = request;

    try {
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
          setState({ type: "pending", capabilityToken });
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
      inFlightRef.current = null;
      switch (outcome.type) {
        case "ready":
          for (const warning of outcome.warnings) {
            showActivationWarning(warning, warningMessages);
          }
          navigateToReadyTask(outcome.threadId);
          return;
        case "unavailable":
          setState({ type: "unavailable", capabilityToken, failure: outcome.failure });
          return;
        case "empty":
          setState({ type: "empty", capabilityToken });
          return;
      }

      outcome satisfies never;
    } catch (error: unknown) {
      if (
        mountedRef.current &&
        currentCapabilityTokenRef.current === capabilityToken &&
        inFlightRef.current === request
      ) {
        inFlightRef.current = null;
        setState({ type: "unexpectedFailure", capabilityToken, error });
      }
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="[overflow-anchor:none]"
        data-thread-history-continuation-action-space=""
        style={{ height: actionSurfaceHeight }}
      />
      <aside
        className="fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-surface/95 px-4 py-4 backdrop-blur"
        ref={actionSurfaceRef}
      >
        <div className="mx-auto grid w-full max-w-3xl gap-3">
          <ContinueTaskFailureAlert
            descriptionId={failureDescriptionId}
            navigateToCurrentTask={navigateToCurrentTask}
            state={visibleState}
          />
          <div className="flex items-center gap-2">
            <QrAccessPopover authorizationToken={authorizationToken} routeTarget={routeTarget} />
            <Button
              aria-describedby={
                visibleState.type === "idle" || visibleState.type === "pending"
                  ? undefined
                  : failureDescriptionId
              }
              className="flex-1"
              isDisabled={capability.activateThread == null}
              isPending={visibleState.type === "pending"}
              onPress={() => {
                void handleContinue();
              }}
              variant="primary"
            >
              <Trans>Continue this task</Trans>
            </Button>
          </div>
        </div>
      </aside>
    </>
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
