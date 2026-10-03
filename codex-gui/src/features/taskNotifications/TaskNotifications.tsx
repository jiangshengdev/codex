import { useEffect, useEffectEvent, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { useAppSelector } from "@/app/hooks";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import { useActiveTaskNavigation } from "@/features/appShell/useActiveTaskNavigation";
import type { AsyncQuestion, AsyncQuestions } from "@/features/asyncQuestions/asyncQuestions";
import type { TaskCompletion } from "@/features/activeThreadSession/taskCompletions";
import { selectGuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { TaskNotificationContext } from "./taskNotificationContext";
import { TaskNotificationMarkers } from "./taskNotificationMarkers";
import { connectBrowserTaskNotifications } from "./browserTaskNotifications";

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
    const preview = notificationPreview(questions[0]?.title.trim() ?? "", 30);
    return t({
      message: `Question: ${preview}`,
      comment: "Browser notification body; preview is the agent's question title",
    });
  });
  const select = useEffectEvent((threadId: string) => {
    navigation.select(threadId);
  });
  const describeCompletion = useEffectEvent((completion: TaskCompletion) => {
    if (completion.status === "failed") {
      const summary = completion.error?.message.trim();
      return summary
        ? t({
            message: `Execution failed: ${summary}`,
            comment: "Browser notification body; summary is the failed turn's error message",
          })
        : t({
            message: "Execution failed",
            comment: "Browser notification for a failed task without error details",
          });
    }
    const preview = notificationPreview(completion.text.replace(/\s+/gu, " ").trim(), 200);
    return (
      preview ||
      t({
        message: "Execution finished",
        comment: "Completed task notification or unread task-entry marker",
      })
    );
  });

  useEffect(() => {
    if (session == null) return;
    const observed = new Map<AsyncQuestions, { count: number; unsubscribe(): void }>();
    const completed = new Map<string, TaskCompletion>();
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
    const sync = () => {
      const current = new Set<AsyncQuestions>();
      const members = session.getCollectionSnapshot().members;
      for (const member of members) {
        const snapshot = member.snapshot;
        if (snapshot?.phase !== "active" && snapshot?.phase !== "projectionUnavailable") continue;
        const completion = snapshot.completion;
        if (completion != null && completed.get(member.threadId) !== completion) {
          completed.set(member.threadId, completion);
          if (viewing() !== member.threadId) {
            markers.mark(member.threadId, "finished");
            if (
              (document.visibilityState !== "visible" || !document.hasFocus()) &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              void notifications?.show(
                member.threadId,
                titleFor(member.threadId),
                describeCompletion(completion),
              );
            }
          }
        }
        const questions = snapshot.questions;
        current.add(questions);
        if (observed.has(questions)) continue;
        const observation = { count: 0, unsubscribe: (): void => undefined };
        const consume = () => {
          const batches = questions.getReceived();
          while (observation.count < batches.length) {
            const batch = batches[observation.count++];
            if (batch != null) receive(member.threadId, batch);
          }
        };
        observed.set(questions, observation);
        observation.unsubscribe = questions.subscribe(consume);
        consume();
      }
      for (const [questions, observation] of observed) {
        if (current.has(questions)) continue;
        observation.unsubscribe();
        observed.delete(questions);
      }
      markers.retain(new Set(members.map((member) => member.threadId)));
      for (const threadId of completed.keys()) {
        if (!members.some((member) => member.threadId === threadId)) completed.delete(threadId);
      }
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
      for (const observation of observed.values()) observation.unsubscribe();
      notifications?.dispose();
    };
  }, [session, router, markers]);

  return <TaskNotificationContext value={unread}>{children}</TaskNotificationContext>;
}

function notificationPreview(text: string, limit: number): string {
  let preview = "";
  let count = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    text,
  )) {
    if (count++ === limit) break;
    preview += segment;
  }
  return preview;
}
