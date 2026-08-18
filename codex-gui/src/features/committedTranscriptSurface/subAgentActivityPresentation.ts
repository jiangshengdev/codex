import type { TranscriptEntryView } from "@/features/transcriptState/transcriptStateSlice";

type TranscriptSubAgentActivityView = Extract<TranscriptEntryView, { type: "subAgentActivity" }>;
type TranscriptSubAgentActivityTitle = Extract<
  TranscriptSubAgentActivityView["title"],
  { agentPath: unknown }
>;

export type SubAgentActivityPresentationInput = Readonly<
  Pick<TranscriptSubAgentActivityView, "id" | "turnId"> & {
    title: TranscriptSubAgentActivityTitle;
  }
>;

export type SubAgentActivityPresentationItem = Readonly<{
  id: TranscriptSubAgentActivityView["id"];
  turnId: TranscriptSubAgentActivityView["turnId"];
  agentThreadId: TranscriptSubAgentActivityTitle["agentThreadId"];
  identityKey: string;
  label: string;
}>;

export type SubAgentActivityGroupPresentation = Readonly<{
  items: readonly SubAgentActivityPresentationItem[];
  omittedCount: number;
}>;

const MAX_VISIBLE_SUB_AGENT_ACTIVITIES = 3;

const pathSegments = (agentPath: string): string[] => {
  const segments = agentPath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error("Expected sub-agent path to contain a task name");
  }
  return segments;
};

const formatPathSegment = (segment: string): string => {
  const words = segment.replaceAll("_", " ");
  const firstVisibleIndex = words.search(/\S/u);
  if (firstVisibleIndex === -1) {
    throw new Error("Expected sub-agent path segment to contain visible text");
  }
  const visibleWords = words.slice(firstVisibleIndex).trimEnd();
  return visibleWords.charAt(0).toUpperCase() + visibleWords.slice(1);
};

export const formatSubAgentTaskName = (agentPath: string): string => {
  const leaf = pathSegments(agentPath).at(-1);
  if (leaf == null) {
    throw new Error("Expected sub-agent path to contain a task name");
  }
  return formatPathSegment(leaf);
};

type PreparedActivity = Readonly<{
  input: SubAgentActivityPresentationInput;
  segments: readonly string[];
  taskLabel: string;
}>;

const labelWithParentDepth = (activity: PreparedActivity, parentDepth: number): string =>
  activity.segments
    .slice(-(parentDepth + 1))
    .map(formatPathSegment)
    .join(" / ");

const disambiguatedLabel = (
  activity: PreparedActivity,
  sameLabelActivities: readonly PreparedActivity[],
): string => {
  const otherAgentActivities = sameLabelActivities.filter(
    (candidate) => candidate.input.title.agentThreadId !== activity.input.title.agentThreadId,
  );
  if (otherAgentActivities.length === 0) {
    return activity.taskLabel;
  }

  const parentCount = activity.segments.length - 1;
  for (let parentDepth = 1; parentDepth <= parentCount; parentDepth += 1) {
    const candidateLabel = labelWithParentDepth(activity, parentDepth);
    const isUnique = otherAgentActivities.every(
      (candidate) => labelWithParentDepth(candidate, parentDepth) !== candidateLabel,
    );
    if (isUnique) {
      return candidateLabel;
    }
  }

  return activity.segments.map(formatPathSegment).join(" / ");
};

export const presentSubAgentActivityGroup = (
  inputs: readonly SubAgentActivityPresentationInput[],
): SubAgentActivityGroupPresentation => {
  const prepared = inputs.map((input): PreparedActivity => {
    const segments = pathSegments(input.title.agentPath);
    const leaf = segments.at(-1);
    if (leaf == null) {
      throw new Error("Expected sub-agent path to contain a task name");
    }
    return {
      input,
      segments,
      taskLabel: formatPathSegment(leaf),
    };
  });
  const activitiesByTaskLabel = new Map<string, PreparedActivity[]>();
  for (const activity of prepared) {
    const group = activitiesByTaskLabel.get(activity.taskLabel);
    if (group == null) {
      activitiesByTaskLabel.set(activity.taskLabel, [activity]);
    } else {
      group.push(activity);
    }
  }
  const items = prepared.map((activity): SubAgentActivityPresentationItem => {
    const { id, turnId, title } = activity.input;
    const sameLabelActivities = activitiesByTaskLabel.get(activity.taskLabel) ?? [activity];
    return {
      id,
      turnId,
      agentThreadId: title.agentThreadId,
      identityKey: JSON.stringify([turnId, id, title.agentThreadId]),
      label: disambiguatedLabel(activity, sameLabelActivities),
    };
  });

  return {
    items: items.slice(0, MAX_VISIBLE_SUB_AGENT_ACTIVITIES),
    omittedCount: Math.max(0, items.length - MAX_VISIBLE_SUB_AGENT_ACTIVITIES),
  };
};
