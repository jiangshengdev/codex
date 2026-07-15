import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownControls,
  streamdownPlugins,
  streamdownRehypePlugins,
  streamdownRemarkRehypeOptions,
} from "./markdownRendering";

export const LiveMarkdownText = ({ source }: { source: string }) => (
  <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
    <Streamdown
      allowElement={allowMarkdownElement}
      caret="block"
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      controls={streamdownControls}
      isAnimating
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="streaming"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      remarkRehypeOptions={streamdownRemarkRehypeOptions}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
