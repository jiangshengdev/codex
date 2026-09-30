import { use, useSyncExternalStore } from "react";
import { Button, TextArea } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { TranscriptReadContext } from "@/features/committedTranscriptSurface/TranscriptReadContext";
import { questionKey, type AsyncQuestion } from "./asyncQuestions";

const noSubscription = () => () => undefined;

export function AsyncQuestionCard({
  question,
  turnId,
  itemId,
  index,
}: {
  question: AsyncQuestion;
  turnId: string;
  itemId: string;
  index: number;
}) {
  const { t } = useLingui();
  const capabilities = use(AppCapabilitiesContext);
  const target = use(TranscriptReadContext);
  const session = capabilities?.activeThreadSession;
  const readBinding = () => {
    const snapshot = session?.getSnapshot();
    return target?.kind === "live" &&
      (snapshot?.phase === "active" || snapshot?.phase === "projectionUnavailable") &&
      target.identity.instanceId === snapshot.identity.instanceId
      ? snapshot
      : null;
  };
  const key = questionKey(turnId, itemId, index);
  const owner = useSyncExternalStore(
    session?.subscribe ?? noSubscription,
    () => readBinding()?.questions ?? null,
  );
  const answer = useSyncExternalStore(
    owner?.subscribe ?? noSubscription,
    () => owner?.get(key) ?? null,
  );
  const enabled = useSyncExternalStore(session?.subscribe ?? noSubscription, () => {
    const binding = readBinding();
    return binding?.phase === "active" && binding.connection.phase === "available";
  });
  return (
    <div role="group" aria-label={question.title} className="grid min-w-0 gap-3">
      <p className="min-w-0 whitespace-pre-wrap wrap-anywhere">{question.title}</p>
      {question.options != null && (
        <ul className="list-disc space-y-1 pl-5">
          {question.options.map((option, optionIndex) => (
            <li
              className="whitespace-pre-wrap wrap-anywhere"
              key={questionKey(turnId, itemId, optionIndex)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
      {answer?.status === "pending" ? (
        <>
          <TextArea
            aria-label={t({ message: "Answer", comment: "Plain-text answer to an agent question" })}
            value={answer.text}
            readOnly={!enabled}
            onChange={(event) => owner?.edit(key, event.target.value)}
            variant="secondary"
            fullWidth
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              isDisabled={!enabled || !answer.text.trim()}
              onPress={() => {
                owner?.submit(key);
              }}
            >
              <Trans comment="Submit only this agent question's answer">Submit answer</Trans>
            </Button>
            <Button variant="tertiary" isDisabled={!enabled} onPress={() => owner?.skip(key)}>
              <Trans comment="Dismiss this question locally without sending an answer">
                Skip question
              </Trans>
            </Button>
          </div>
        </>
      ) : answer?.status === "submitted" ? (
        <p className="text-sm text-muted">
          <Trans comment="Answer accepted by the local sending queue, not necessarily consumed">
            Answer submitted
          </Trans>
        </p>
      ) : answer?.status === "skipped" ? (
        <p className="text-sm text-muted">
          <Trans comment="Question dismissed locally without sending an answer">
            Question skipped
          </Trans>
        </p>
      ) : null}
    </div>
  );
}
