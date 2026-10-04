import type { ThreadTokenUsage } from "@codex-protocol/v2";

export type ContextUsageModel = Readonly<{
  usedTokens: number;
  modelContextWindow: number | null;
  percentage: number | null;
  usedTokensCompact: string;
  modelContextWindowCompact: string | null;
}>;

const trimTrailingZeros = (value: string): string => value.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");

const formatScaledCount = (
  value: number,
  scale: number,
  suffix: "k" | "M",
  fractionDigits: number,
): string => `${trimTrailingZeros((value / scale).toFixed(fractionDigits))}${suffix}`;

export const formatCompactTokenCount = (value: number): string => {
  if (value >= 1_000_000) {
    return formatScaledCount(value, 1_000_000, "M", 2);
  }

  if (value >= 10_000) {
    return `${String(Math.round(value / 1_000))}k`;
  }

  if (value >= 1_000) {
    return formatScaledCount(value, 1_000, "k", 1);
  }

  return String(value);
};

export const contextUsageModelFromTokenUsage = (
  tokenUsage: ThreadTokenUsage | null,
): ContextUsageModel | null => {
  if (tokenUsage == null) {
    return null;
  }

  const usedTokens = tokenUsage.last.totalTokens;
  const modelContextWindow = tokenUsage.modelContextWindow;
  const percentage =
    modelContextWindow != null && modelContextWindow > 0
      ? Math.round(Math.max(0, Math.min(1, usedTokens / modelContextWindow)) * 100)
      : null;

  return {
    usedTokens,
    modelContextWindow,
    percentage,
    usedTokensCompact: formatCompactTokenCount(usedTokens),
    modelContextWindowCompact:
      modelContextWindow == null ? null : formatCompactTokenCount(modelContextWindow),
  };
};
