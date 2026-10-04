import { Streamdown } from "streamdown";
import {
  assistantRemarkPlugins,
  assistantStreamdownPlugins,
  markdownContainerClassName,
  streamdownCommonProps,
} from "./markdownRendering";

export const MarkdownText = ({
  source,
  enableMath = false,
}: {
  source: string;
  enableMath?: boolean;
}) => (
  <div className={markdownContainerClassName} data-assistant-math={enableMath || undefined}>
    <Streamdown
      {...streamdownCommonProps}
      plugins={enableMath ? assistantStreamdownPlugins : streamdownCommonProps.plugins}
      remarkPlugins={enableMath ? assistantRemarkPlugins : undefined}
      mode="static"
    >
      {source}
    </Streamdown>
  </div>
);
