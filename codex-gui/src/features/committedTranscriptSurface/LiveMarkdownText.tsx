import { Streamdown } from "streamdown";
import {
  markdownContainerClassName,
  streamdownCommonProps,
  useStreamdownTranslations,
} from "./markdownRendering";

export const LiveMarkdownText = ({ source }: { source: string }) => {
  const translations = useStreamdownTranslations();

  return (
    <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
      <Streamdown
        {...streamdownCommonProps}
        caret="block"
        isAnimating
        mode="streaming"
        translations={translations}
      >
        {source}
      </Streamdown>
    </div>
  );
};
