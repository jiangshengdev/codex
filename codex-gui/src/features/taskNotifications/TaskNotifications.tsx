import { useEffect, useEffectEvent, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { useAppSelector } from "@/app/hooks";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import { useActiveTaskNavigation } from "@/features/appShell/useActiveTaskNavigation";
import type { AsyncQuestion, AsyncQuestions } from "@/features/asyncQuestions/asyncQuestions";
import { selectGuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { TaskNotificationContext } from "./taskNotificationContext";
import { TaskNotificationMarkers } from "./taskNotificationMarkers";
import { connectBrowserTaskNotifications } from "./browserTaskNotifications";
import {
  notificationPreview,
  type TaskCompletion,
  type TaskCompletionNotifications,
} from "./taskCompletionNotifications";

export function TaskNotifications({ children }: Readonly<{ children: ReactNode }>) {
  const { activeThreadSession: session } = useAppCapabilities();
  const router = useRouter();
  const navigation = useActiveTaskNavigation(() => undefined);
  const { t } = useLingui();
  const runtime = useAppSelector((state) => state.threadRuntime);
  const [markers] = useState(() => new TaskNotificationMarkers());
  const unread = useSyncExternalStore(markers.subscribe, markers.getSnapshot);
  const titleFor = useEffectEvent((threadId: string) => {
    const name = runtime.byThreadId[threadId]?.current?.thread.name?.trim();
    return name != null && name.length > 0 ? name : threadId;
  });
  const describe = useEffectEvent((questions: readonly AsyncQuestion[]) => {
    const count = questions.length;
    if (count > 1)
      return t`${plural(count, { one: "# question needs a response", other: "# questions need a response" })}`;
    const preview = notificationPreview(questions[0]?.title ?? "", 30);
    return t({
      message: `Question: ${preview}`,
      comment: "Browser notification body; preview is the agent's question title",
    });
  });
  const describeCompletion = useEffectEvent((completion: TaskCompletion) => {
    if (completion.failed) {
      const error = notificationPreview(completion.error ?? "", 200);
      return error
        ? t({
            message: `Execution failed: ${error}`,
            comment: "Browser notification; error is the failed turn's error summary",
          })
        : t({
            message: "Execution failed",
            comment: "Browser notification when the turn failed without an error summary",
          });
    }
    return (
      completion.preview ||
      t({
        message: "Execution finished",
        comment: "Browser notification when execution completed without a final answer",
      })
    );
  });
  const select = useEffectEvent((threadId: string) => {
    navigation.select(threadId);
  });

  useEffect(() => {
    if (session == null) return;
    const observed = new Map<AsyncQuestions | TaskCompletionNotifications, () => void>();
    const notifications = connectBrowserTaskNotifications((threadId) => {
      if (!session.getCollectionSnapshot().members.some((member) => member.threadId === threadId))
        return false;
      select(threadId);
      return true;
    });
    const viewing = (): string | null => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return null;
      const target = selectGuiRouteTarget(router.state.matches);
      const snapshot = session.getSnapshot();
      return router.state.status === "idle" &&
        target?.type === "currentTask" &&
        (snapshot.phase === "active" || snapshot.phase === "projectionUnavailable") &&
        snapshot.threadId === target.threadId
        ? target.threadId
        : null;
    };
    const clearViewed = () => {
      const threadId = viewing();
      if (threadId == null) return;
      markers.viewed(threadId);
    };
    const receive = (threadId: string, questions: readonly AsyncQuestion[]) => {
      if (viewing() === threadId) return;
      markers.mark(threadId, "waiting");
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const title = titleFor(threadId);
      const body = describe(questions);
      void notifications?.show(threadId, title, body);
    };
    const receiveCompletion = (threadId: string, completion: TaskCompletion) => {
      if (viewing() === threadId) return;
      markers.mark(threadId, "finished");
      if (document.visibilityState === "visible" && document.hasFocus()) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      void notifications?.show(threadId, titleFor(threadId), describeCompletion(completion));
    };
    const sync = () => {
      const current = new Set<AsyncQuestions | TaskCompletionNotifications>();
      const members = session.getCollectionSnapshot().members;
      for (const member of members) {
        const snapshot = member.snapshot;
        if (snapshot?.phase !== "active" && snapshot?.phase !== "projectionUnavailable") continue;
        const completions = snapshot.completions;
        current.add(completions);
        if (!observed.has(completions))
          observed.set(
            completions,
            subscribeReceived(completions.getReceived, completions.subscribe, (completion) => {
              receiveCompletion(member.threadId, completion);
            }),
          );
        const questions = snapshot.questions;
        current.add(questions);
        if (observed.has(questions)) continue;
        observed.set(
          questions,
          subscribeReceived(questions.getReceived, questions.subscribe, (batch) => {
            receive(member.threadId, batch);
          }),
        );
      }
      for (const [questions, observation] of observed) {
        if (current.has(questions)) continue;
        observation();
        observed.delete(questions);
      }
      markers.retain(new Set(members.map((member) => member.threadId)));
      clearViewed();
    };
    const unsubscribe = session.subscribe(sync);
    const unsubscribeRoute = router.subscribe("onResolved", clearViewed);
    window.addEventListener("focus", clearViewed);
    document.addEventListener("visibilitychange", clearViewed);
    sync();
    return () => {
      unsubscribe();
      unsubscribeRoute();
      window.removeEventListener("focus", clearViewed);
      document.removeEventListener("visibilitychange", clearViewed);
      for (const unsubscribe of observed.values()) unsubscribe();
      notifications?.dispose();
    };
  }, [session, router, markers]);

  return <TaskNotificationContext value={unread}>{children}</TaskNotificationContext>;
}

function subscribeReceived<Batch>(
  getReceived: () => readonly Batch[],
  subscribe: (listener: () => void) => () => void,
  receive: (batch: Batch) => void,
): () => void {
  let count = 0;
  const consume = () => {
    const batches = getReceived();
    while (count < batches.length) {
      const batch = batches[count++];
      if (batch != null) receive(batch);
    }
  };
  const unsubscribe = subscribe(consume);
  consume();
  return unsubscribe;
}
