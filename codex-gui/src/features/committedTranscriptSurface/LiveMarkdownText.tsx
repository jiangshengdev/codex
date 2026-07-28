import { Streamdown } from "streamdown";
import { markdownContainerClassName, streamdownCommonProps } from "./markdownRendering";

export const LiveMarkdownText = ({ source }: { source: string }) => (
  <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
    <Streamdown {...streamdownCommonProps} caret="block" isAnimating mode="streaming">
      {source}
    </Streamdown>
  </div>
);
