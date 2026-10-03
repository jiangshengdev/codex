import type { ThreadItem } from "@codex-protocol/v2";
import { createListenerSet } from "@/subscriptions/listenerSet";
import type { ActiveThreadProjectionAcceptedEvent } from "@/features/activeThreadSession/activeThreadProjectionFacts";

export type AsyncQuestion = NonNullable<
  Extract<ThreadItem, { type: "agentMessage" }>["questions"]
>[number];
export type QuestionAnswer = Readonly<{
  text: string;
  selectedOption: number | null;
  status: "pending" | "submitted" | "skipped";
}>;

export function questionAnswerText(question: AsyncQuestion, answer: QuestionAnswer): string {
  return answer.selectedOption === null
    ? answer.text
    : (question.options?.[answer.selectedOption] ?? "");
}

export function answeredQuestionText(question: string, answer: string): string {
  const encoder = new TextEncoder();
  let prefix = "";
  let bytes = 0;
  for (const character of question) {
    bytes += encoder.encode(character).length;
    if (bytes > 512) break;
    prefix += character;
  }
  return `> ${prefix.replace(/[\r\n]/g, " ")}\n\n${answer}`;
}

/** Page-local answers. Snapshot attachment never populates this owner. */
export class AsyncQuestions {
  private readonly received: (readonly AsyncQuestion[])[] = [];
  private readonly answers = new Map<string, QuestionAnswer>();
  private readonly questions = new Map<string, AsyncQuestion>();
  private readonly listeners = createListenerSet();
  private readonly enabled: () => boolean;
  private readonly deliver: (text: string) => boolean;
  constructor(enabled: () => boolean, deliver: (text: string) => boolean) {
    this.enabled = enabled;
    this.deliver = deliver;
  }

  readonly subscribe = (listener: () => void) => this.listeners.subscribe(listener);
  readonly get = (key: string): QuestionAnswer | null => this.answers.get(key) ?? null;
  /** Live question batches only; shares answer deduplication and projection replay rules. */
  readonly getReceived = (): readonly (readonly AsyncQuestion[])[] => this.received;

  observe(fact: ActiveThreadProjectionAcceptedEvent): void {
    const event = fact.notification.event;
    if (fact.replay !== "live" || (event.type !== "itemStarted" && event.type !== "itemCompleted"))
      return;
    const { item, turnId } = event.notification;
    if (item.type !== "agentMessage" || item.delivery !== "async") return;
    const received: AsyncQuestion[] = [];
    for (const [index, question] of (item.questions ?? []).entries()) {
      const key = questionKey(turnId, item.id, index);
      if (this.answers.has(key)) continue;
      received.push(question);
      this.questions.set(key, question);
      this.answers.set(key, {
        text: "",
        selectedOption: question.options?.length ? 0 : null,
        status: "pending",
      });
    }
    if (received.length > 0) this.received.push(received);
    this.listeners.notify();
  }

  edit(key: string, text: string): void {
    const answer = this.get(key);
    if (!this.enabled() || answer?.status !== "pending") return;
    this.answers.set(key, { ...answer, text, selectedOption: null });
    this.listeners.notify();
  }

  select(key: string, selectedOption: number | null): void {
    const answer = this.get(key);
    if (!this.enabled() || answer?.status !== "pending") return;
    this.answers.set(key, { ...answer, selectedOption });
    this.listeners.notify();
  }

  submit(key: string): boolean {
    const answer = this.get(key);
    const question = this.questions.get(key);
    if (!this.enabled() || answer?.status !== "pending" || question == null) return false;
    const text = questionAnswerText(question, answer);
    if (!text.trim() || !this.deliver(answeredQuestionText(question.title, text))) return false;
    this.answers.set(key, { ...answer, status: "submitted" });
    this.listeners.notify();
    return true;
  }

  skip(key: string): void {
    const answer = this.get(key);
    if (!this.enabled() || answer?.status !== "pending") return;
    this.answers.set(key, { ...answer, status: "skipped" });
    this.listeners.notify();
  }
}

export const questionKey = (turnId: string, itemId: string, index: number): string =>
  JSON.stringify([turnId, itemId, index]);
