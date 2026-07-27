import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { defaultHandlers, type Handler } from "mdast-util-to-hast";
import { isAbsolute } from "pathe";
import { useMemo } from "react";
import {
  defaultRehypePlugins,
  type AllowElement,
  type Components,
  type ControlsConfig,
  type StreamdownProps,
  type StreamdownTranslations,
} from "streamdown";
import { parse as parseUri } from "uri-js";

const isAbsolutePath = isAbsolute as (path: string) => boolean;

const streamdownTranslationDescriptors = {
  close: msg({ comment: "Button that closes a Streamdown overlay", message: "Close" }),
  copied: msg({ comment: "Confirmation shown after copying Markdown content", message: "Copied" }),
  copyCode: msg({ comment: "Button that copies a rendered code block", message: "Copy Code" }),
  copyLink: msg({ comment: "Button that copies a rendered link", message: "Copy link" }),
  copyTable: msg({ comment: "Button that copies a rendered Markdown table", message: "Copy table" }),
  copyTableAsCsv: msg({
    comment: "Menu item that copies a rendered table in CSV format",
    message: "Copy table as CSV",
  }),
  copyTableAsMarkdown: msg({
    comment: "Menu item that copies a rendered table in Markdown format",
    message: "Copy table as Markdown",
  }),
  copyTableAsTsv: msg({
    comment: "Menu item that copies a rendered table in TSV format",
    message: "Copy table as TSV",
  }),
  downloadDiagram: msg({
    comment: "Button that downloads a rendered Mermaid diagram",
    message: "Download diagram",
  }),
  downloadDiagramAsMmd: msg({
    comment: "Menu item that downloads a Mermaid diagram as an MMD source file",
    message: "Download diagram as MMD",
  }),
  downloadDiagramAsPng: msg({
    comment: "Menu item that downloads a Mermaid diagram as a PNG image",
    message: "Download diagram as PNG",
  }),
  downloadDiagramAsSvg: msg({
    comment: "Menu item that downloads a Mermaid diagram as an SVG image",
    message: "Download diagram as SVG",
  }),
  downloadFile: msg({
    comment: "Button that downloads a file linked from rendered Markdown",
    message: "Download file",
  }),
  downloadImage: msg({
    comment: "Button that downloads an image from rendered Markdown",
    message: "Download image",
  }),
  downloadTable: msg({
    comment: "Button that downloads a rendered Markdown table",
    message: "Download table",
  }),
  downloadTableAsCsv: msg({
    comment: "Menu item that downloads a rendered table in CSV format",
    message: "Download table as CSV",
  }),
  downloadTableAsMarkdown: msg({
    comment: "Menu item that downloads a rendered table in Markdown format",
    message: "Download table as Markdown",
  }),
  exitFullscreen: msg({
    comment: "Button that exits the fullscreen Markdown preview",
    message: "Exit fullscreen",
  }),
  externalLinkWarning: msg({
    comment: "Warning shown before opening a link to an external website",
    message: "You're about to visit an external website.",
  }),
  imageNotAvailable: msg({
    comment: "Fallback shown when a Markdown image cannot be displayed",
    message: "Image not available",
  }),
  mermaidFormatMmd: msg({
    comment: "File format label for Mermaid source files",
    message: "MMD",
  }),
  mermaidFormatPng: msg({ comment: "Image format label", message: "PNG" }),
  mermaidFormatSvg: msg({ comment: "Image format label", message: "SVG" }),
  openExternalLink: msg({
    comment: "Confirmation title shown before opening an external website",
    message: "Open external link?",
  }),
  openLink: msg({
    comment: "Button that confirms opening a rendered Markdown link",
    message: "Open link",
  }),
  tableFormatCsv: msg({ comment: "Table export format label", message: "CSV" }),
  tableFormatMarkdown: msg({ comment: "Table export format label", message: "Markdown" }),
  tableFormatTsv: msg({ comment: "Table export format label", message: "TSV" }),
  viewFullscreen: msg({
    comment: "Button that opens rendered Markdown content in fullscreen",
    message: "View fullscreen",
  }),
} satisfies Record<keyof StreamdownTranslations, MessageDescriptor>;

export function useStreamdownTranslations(): StreamdownTranslations {
  const { t } = useLingui();

  return useMemo(
    () => ({
      close: t(streamdownTranslationDescriptors.close),
      copied: t(streamdownTranslationDescriptors.copied),
      copyCode: t(streamdownTranslationDescriptors.copyCode),
      copyLink: t(streamdownTranslationDescriptors.copyLink),
      copyTable: t(streamdownTranslationDescriptors.copyTable),
      copyTableAsCsv: t(streamdownTranslationDescriptors.copyTableAsCsv),
      copyTableAsMarkdown: t(streamdownTranslationDescriptors.copyTableAsMarkdown),
      copyTableAsTsv: t(streamdownTranslationDescriptors.copyTableAsTsv),
      downloadDiagram: t(streamdownTranslationDescriptors.downloadDiagram),
      downloadDiagramAsMmd: t(streamdownTranslationDescriptors.downloadDiagramAsMmd),
      downloadDiagramAsPng: t(streamdownTranslationDescriptors.downloadDiagramAsPng),
      downloadDiagramAsSvg: t(streamdownTranslationDescriptors.downloadDiagramAsSvg),
      downloadFile: t(streamdownTranslationDescriptors.downloadFile),
      downloadImage: t(streamdownTranslationDescriptors.downloadImage),
      downloadTable: t(streamdownTranslationDescriptors.downloadTable),
      downloadTableAsCsv: t(streamdownTranslationDescriptors.downloadTableAsCsv),
      downloadTableAsMarkdown: t(streamdownTranslationDescriptors.downloadTableAsMarkdown),
      exitFullscreen: t(streamdownTranslationDescriptors.exitFullscreen),
      externalLinkWarning: t(streamdownTranslationDescriptors.externalLinkWarning),
      imageNotAvailable: t(streamdownTranslationDescriptors.imageNotAvailable),
      mermaidFormatMmd: t(streamdownTranslationDescriptors.mermaidFormatMmd),
      mermaidFormatPng: t(streamdownTranslationDescriptors.mermaidFormatPng),
      mermaidFormatSvg: t(streamdownTranslationDescriptors.mermaidFormatSvg),
      openExternalLink: t(streamdownTranslationDescriptors.openExternalLink),
      openLink: t(streamdownTranslationDescriptors.openLink),
      tableFormatCsv: t(streamdownTranslationDescriptors.tableFormatCsv),
      tableFormatMarkdown: t(streamdownTranslationDescriptors.tableFormatMarkdown),
      tableFormatTsv: t(streamdownTranslationDescriptors.tableFormatTsv),
      viewFullscreen: t(streamdownTranslationDescriptors.viewFullscreen),
    }),
    [t],
  );
}

const isProtocolLessFileTarget = (target: string) =>
  isAbsolutePath(target) || parseUri(target).scheme === undefined;

const renderProtocolLessLinkAsText = (
  anchor: ReturnType<typeof defaultHandlers.link>,
  target: string,
): ReturnType<Handler> => [
  { type: "text", value: "[" },
  ...anchor.children,
  { type: "text", value: "](" },
  { type: "text", value: target },
  { type: "text", value: ")" },
];

const renderLink: Handler = (state, linkNode: Parameters<typeof defaultHandlers.link>[1]) => {
  const anchor = defaultHandlers.link(state, linkNode);
  return isProtocolLessFileTarget(linkNode.url)
    ? renderProtocolLessLinkAsText(anchor, linkNode.url)
    : anchor;
};

const renderLinkReference: Handler = (
  state,
  referenceNode: Parameters<typeof defaultHandlers.linkReference>[1],
) => {
  const defaultResult = defaultHandlers.linkReference(state, referenceNode);
  const definition = state.definitionById.get(referenceNode.identifier.toUpperCase());

  if (
    !definition ||
    !isProtocolLessFileTarget(definition.url) ||
    Array.isArray(defaultResult) ||
    defaultResult.type !== "element" ||
    defaultResult.tagName !== "a"
  ) {
    return defaultResult;
  }

  return renderProtocolLessLinkAsText(defaultResult, definition.url);
};

export const streamdownRemarkRehypeOptions: NonNullable<StreamdownProps["remarkRehypeOptions"]> = {
  handlers: {
    link: renderLink,
    linkReference: renderLinkReference,
  },
};

export const streamdownPlugins = { code, cjk };

const clipboardWriteAvailable =
  typeof window !== "undefined" &&
  window.isSecureContext &&
  typeof (navigator as Partial<Pick<Navigator, "clipboard">>).clipboard?.writeText === "function";

export const streamdownControls: ControlsConfig = clipboardWriteAvailable
  ? true
  : {
      code: { copy: false },
      mermaid: { copy: false },
      table: { copy: false },
    };

export const streamdownRehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
].filter((plugin): plugin is NonNullable<typeof plugin> => plugin != null);

export const allowMarkdownElement: AllowElement = ({ tagName }) => tagName !== "img";

export const streamdownComponents: Components = {
  inlineCode: ({ children, className, node: _node, ...props }) => (
    <code
      className={[
        "rounded border border-border bg-default px-1 py-0.5 font-mono text-sm text-default-700 wrap-break-word",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </code>
  ),
};

export const markdownContainerClassName =
  "committed-transcript-entry-markdown committed-transcript-entry-source grid min-w-0 gap-2 wrap-break-word leading-6";

export const markdownStreamdownClassName = "min-w-0 wrap-break-word";

export const streamdownCommonProps: Pick<
  StreamdownProps,
  | "allowElement"
  | "className"
  | "components"
  | "controls"
  | "linkSafety"
  | "lineNumbers"
  | "plugins"
  | "rehypePlugins"
  | "remarkRehypeOptions"
  | "skipHtml"
> = {
  allowElement: allowMarkdownElement,
  className: markdownStreamdownClassName,
  components: streamdownComponents,
  controls: streamdownControls,
  linkSafety: { enabled: false },
  lineNumbers: false,
  plugins: streamdownPlugins,
  rehypePlugins: streamdownRehypePlugins,
  remarkRehypeOptions: streamdownRemarkRehypeOptions,
  skipHtml: true,
};
