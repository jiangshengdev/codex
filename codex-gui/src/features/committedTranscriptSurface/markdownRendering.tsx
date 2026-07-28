import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { defaultHandlers, type Handler } from "mdast-util-to-hast";
import { isAbsolute } from "pathe";
import {
  defaultRehypePlugins,
  type AllowElement,
  type Components,
  type ControlsConfig,
  type StreamdownProps,
} from "streamdown";
import { parse as parseUri } from "uri-js";

const isAbsolutePath = isAbsolute as (path: string) => boolean;

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
