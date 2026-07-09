import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownPlugins,
  streamdownRehypePlugins,
} from "./markdownRendering";

export const LiveMarkdownText = ({ source }: { source: string }) => (
  <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
    <Streamdown
      allowElement={allowMarkdownElement}
      caret="block"
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      isAnimating
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="streaming"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
