import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { Streamdown, defaultRehypePlugins, type AllowElement } from "streamdown";

const streamdownPlugins = { code, cjk };
const streamdownRehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
].filter((plugin): plugin is NonNullable<typeof plugin> => plugin != null);

const allowMarkdownElement: AllowElement = ({ tagName }) => tagName !== "img";

export const MarkdownText = ({ source }: { source: string }) => (
  <div className="committed-transcript-entry-markdown committed-transcript-entry-source grid min-w-0 gap-2 wrap-break-word leading-6">
    <Streamdown
      allowElement={allowMarkdownElement}
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
