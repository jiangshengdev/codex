import { Streamdown } from "streamdown";
import {
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
      caret="block"
      isAnimating
      mode="streaming"
    >
      {source}
    </Streamdown>
  </div>
);
