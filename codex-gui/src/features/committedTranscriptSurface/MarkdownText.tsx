import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { Streamdown, defaultRehypePlugins, type AllowElement, type Components } from "streamdown";

const streamdownPlugins = { code, cjk };
const streamdownRehypePlugins = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden].filter(
  (plugin): plugin is NonNullable<typeof plugin> => plugin != null,
);

const allowMarkdownElement: AllowElement = ({ tagName }) => tagName !== "img";

const streamdownComponents: Components = {
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

export const MarkdownText = ({ source }: { source: string }) => (
  <div className="committed-transcript-entry-markdown committed-transcript-entry-source grid min-w-0 gap-2 wrap-break-word leading-6">
    <Streamdown
      allowElement={allowMarkdownElement}
      className="min-w-0 wrap-break-word"
      components={streamdownComponents}
      linkSafety={{ enabled: false }}
      mode="static"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
