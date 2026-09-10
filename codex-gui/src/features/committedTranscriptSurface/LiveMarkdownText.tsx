import { Streamdown } from "streamdown";
import { parseAssistantMarkdownIntoBlocks } from "./remarkBackslashMath";
import {
  assistantRemarkPlugins,
  assistantStreamdownPlugins,
  markdownContainerClassName,
  streamdownCommonProps,
} from "./markdownRendering";

export const LiveMarkdownText = ({
  source,
  enableMath = false,
}: {
  source: string;
  enableMath?: boolean;
}) => (
  <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
    <Streamdown
      {...streamdownCommonProps}
      plugins={enableMath ? assistantStreamdownPlugins : streamdownCommonProps.plugins}
      remarkPlugins={enableMath ? assistantRemarkPlugins : undefined}
      parseMarkdownIntoBlocksFn={enableMath ? parseAssistantMarkdownIntoBlocks : undefined}
      caret="block"
      isAnimating
      mode="streaming"
    >
      {source}
    </Streamdown>
  </div>
);
