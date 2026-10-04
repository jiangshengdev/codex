import { Button, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Copy } from "lucide-react";
import { use } from "react";
import { StreamdownContext } from "streamdown";
import { useMarkdownCopyFeedback } from "./useMarkdownCopyFeedback";

export const MarkdownCodeCopyButton = ({
  code,
  onErrorChange,
}: {
  code: string;
  onErrorChange: (failed: boolean) => void;
}) => {
  const { t } = useLingui();
  const { isAnimating } = use(StreamdownContext);
  const { status, copy } = useMarkdownCopyFeedback(onErrorChange);

  const label =
    status === "copied"
      ? t({
          message: "Code copied",
          comment: "Success label on a Markdown code block copy button.",
        })
      : t({
          message: "Copy code",
          comment: "Copy the entire Markdown code block to the clipboard.",
        });

  return (
    <Tooltip>
      <Button
        data-streamdown="code-block-copy-button"
        data-markdown-action
        variant="ghost"
        size="sm"
        isIconOnly
        aria-label={label}
        isDisabled={isAnimating || status === "pending"}
        onPress={() => {
          void copy(() => navigator.clipboard.writeText(code));
        }}
      >
        {status === "copied" ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
};
