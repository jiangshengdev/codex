import { use, useSyncExternalStore } from "react";
import { Button, Radio, RadioGroup, TextArea } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { TranscriptReadContext } from "@/features/committedTranscriptSurface/TranscriptReadContext";
import { questionAnswerText, questionKey, type AsyncQuestion } from "./asyncQuestions";

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
      {question.options != null && answer?.status !== "pending" && (
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
          {!!question.options?.length && (
            <RadioGroup
              aria-label={question.title}
              value={answer.selectedOption === null ? "custom" : String(answer.selectedOption)}
              onChange={(value) => owner?.select(key, value === "custom" ? null : Number(value))}
              isDisabled={!enabled}
              variant="secondary"
              className="min-w-0 [&_[data-slot=radio-content]]:items-start [&_[data-slot=radio-control]]:mt-[calc((1lh-var(--spacing)*4)/2)]"
            >
              {question.options.map((option, optionIndex) => (
                <Radio
                  key={questionKey(turnId, itemId, optionIndex)}
                  value={String(optionIndex)}
                  className="min-w-0"
                >
                  <Radio.Content className="min-w-0">
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    <span className="min-w-0 whitespace-pre-wrap wrap-anywhere">{option}</span>
                  </Radio.Content>
                </Radio>
              ))}
              <Radio value="custom">
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <Trans comment="Choose a freely typed answer instead of an agent-provided option">
                    Custom answer
                  </Trans>
                </Radio.Content>
              </Radio>
            </RadioGroup>
          )}
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
              isDisabled={!enabled || !questionAnswerText(question, answer).trim()}
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
