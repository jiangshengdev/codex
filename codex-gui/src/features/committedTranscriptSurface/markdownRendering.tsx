import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import {
  defaultRehypePlugins,
  type AllowElement,
  type Components,
  type ControlsConfig,
} from "streamdown";

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
