import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { use, useEffect, useRef, useState } from "react";
import { StreamdownContext } from "streamdown";

export const MarkdownCodeCopyButton = ({
  code,
  onErrorChange,
}: {
  code: string;
  onErrorChange: (failed: boolean) => void;
}) => {
  const { t } = useLingui();
  const { isAnimating } = use(StreamdownContext);
  const [status, setStatus] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    clearTimeout(timer.current);
    setStatus("pending");
    onErrorChange(false);
    try {
      await navigator.clipboard.writeText(code);
      if (!mounted.current) return;
      setStatus("copied");
      timer.current = setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch {
      if (mounted.current) {
        setStatus("failed");
        onErrorChange(true);
      }
    }
  };

  return (
    <Button
      data-streamdown="code-block-copy-button"
      variant="ghost"
      size="sm"
      isDisabled={isAnimating || status === "pending"}
      onPress={() => {
        void copy();
      }}
    >
      {status === "copied"
        ? t({
            message: "Code copied",
            comment: "Success label on a Markdown code block copy button.",
          })
        : t({
            message: "Copy code",
            comment: "Copy the entire Markdown code block to the clipboard.",
          })}
    </Button>
  );
};
