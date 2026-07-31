import { Streamdown } from "streamdown";
import { markdownContainerClassName, streamdownCommonProps } from "./markdownRendering";

export const MarkdownText = ({ source }: { source: string }) => (
  <div className={markdownContainerClassName}>
    <Streamdown {...streamdownCommonProps} mode="static">
      {source}
    </Streamdown>
  </div>
);
