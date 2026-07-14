import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownControls,
  streamdownPlugins,
  streamdownRehypePlugins,
} from "./markdownRendering";

export const MarkdownText = ({ source }: { source: string }) => (
  <div className={markdownContainerClassName}>
    <Streamdown
      allowElement={allowMarkdownElement}
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      controls={streamdownControls}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="static"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
