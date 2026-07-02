import { Children, cloneElement, isValidElement } from "react";
import { Typography } from "@heroui/react";
import ReactMarkdown, { type Components } from "react-markdown";

const allowedMarkdownElements = [
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
];

const markdownComponents: Components = {
  blockquote: ({ children }) => (
    <blockquote className="min-w-0 border-l border-border pl-3 text-muted">{children}</blockquote>
  ),
  code: ({ children, className }) => (
    <code className={className ?? "rounded bg-muted px-1 py-0.5 font-mono text-sm wrap-break-word"}>
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <Typography.Heading className="min-w-0 wrap-break-word" level={1}>
      {children}
    </Typography.Heading>
  ),
  h2: ({ children }) => (
    <Typography.Heading className="min-w-0 wrap-break-word" level={2}>
      {children}
    </Typography.Heading>
  ),
  h3: ({ children }) => (
    <Typography.Heading className="min-w-0 wrap-break-word" level={3}>
      {children}
    </Typography.Heading>
  ),
  h4: ({ children }) => (
    <Typography.Heading className="min-w-0 wrap-break-word" level={4}>
      {children}
    </Typography.Heading>
  ),
  h5: ({ children }) => (
    <Typography.Heading className="min-w-0 wrap-break-word" level={5}>
      {children}
    </Typography.Heading>
  ),
  h6: ({ children }) => (
    <Typography.Heading className="min-w-0 wrap-break-word" level={6}>
      {children}
    </Typography.Heading>
  ),
  li: ({ children }) => <li className="min-w-0 pl-1 wrap-break-word">{children}</li>,
  ol: ({ children }) => (
    <ol className="grid min-w-0 list-decimal gap-1 pl-5 wrap-break-word">{children}</ol>
  ),
  p: ({ children }) => (
    <Typography className="min-w-0 max-w-full wrap-break-word leading-6" type="body-sm">
      {children}
    </Typography>
  ),
  pre: ({ children }) => (
    <pre className="min-w-0 overflow-x-auto rounded bg-muted p-3 text-sm leading-6">
      {Children.map(children, (child) =>
        isValidElement<{ className?: string }>(child)
          ? cloneElement(child, { className: "font-mono text-sm whitespace-pre" })
          : child,
      )}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="grid min-w-0 list-disc gap-1 pl-5 wrap-break-word">{children}</ul>
  ),
};

export const MarkdownText = ({ source }: { source: string }) => (
  <div className="committed-transcript-entry-markdown committed-transcript-entry-source grid min-w-0 gap-2 wrap-break-word leading-6">
    <ReactMarkdown
      allowedElements={allowedMarkdownElements}
      components={markdownComponents}
      skipHtml
      unwrapDisallowed
    >
      {source}
    </ReactMarkdown>
  </div>
);
