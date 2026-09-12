import { Alert } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { isValidElement, use, useState, type ComponentProps } from "react";
import {
  CodeBlock,
  StreamdownContext,
  useIsCodeFenceIncomplete,
  type Components,
} from "streamdown";
import { MarkdownCodeCopyButton } from "./MarkdownCodeCopyButton";

type MarkdownCodeProps = ComponentProps<Exclude<NonNullable<Components["code"]>, string>>;

const codeClipboardAvailable =
  typeof window !== "undefined" &&
  window.isSecureContext &&
  typeof (navigator as Partial<Pick<Navigator, "clipboard">>).clipboard?.writeText === "function";

export const MarkdownCode = ({ children, className, node, ...props }: MarkdownCodeProps) => {
  const { lineNumbers } = use(StreamdownContext);
  const isIncomplete = useIsCodeFenceIncomplete();
  const [copyFailed, setCopyFailed] = useState(false);
  if (!("data-block" in props)) {
    return (
      <code
        {...props}
        className={`rounded bg-muted px-1.5 py-0.5 font-mono text-sm ${className ?? ""}`}
        data-streamdown="inline-code"
      >
        {children}
      </code>
    );
  }

  const language = className?.match(/language-([^\s]+)/)?.[1] ?? "";
  const meta = node?.properties.metastring;
  const startLineValue = typeof meta === "string" ? /startLine=(\d+)/.exec(meta)?.[1] : undefined;
  const startLine =
    startLineValue && Number(startLineValue) >= 1 ? Number(startLineValue) : undefined;
  const showLineNumbers =
    lineNumbers && !(typeof meta === "string" && /\bnoLineNumbers\b/.test(meta));
  const code =
    typeof children === "string"
      ? children
      : isValidElement<{ children?: unknown }>(children) &&
          typeof children.props.children === "string"
        ? children.props.children
        : "";
  const { "data-block": _blockMarker, ...forwarded } = props;

  return (
    <>
      <CodeBlock
        {...forwarded}
        className={className}
        code={code}
        language={language}
        isIncomplete={isIncomplete}
        startLine={startLine}
        lineNumbers={showLineNumbers}
      >
        {codeClipboardAvailable ? (
          <MarkdownCodeCopyButton code={code} onErrorChange={setCopyFailed} />
        ) : null}
      </CodeBlock>
      {copyFailed && (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              <Trans>Could not copy code. Try again.</Trans>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </>
  );
};
