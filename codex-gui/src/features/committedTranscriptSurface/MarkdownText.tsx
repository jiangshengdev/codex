import { Streamdown } from "streamdown";
import {
  markdownContainerClassName,
  streamdownCommonProps,
  useStreamdownTranslations,
} from "./markdownRendering";

export const MarkdownText = ({ source }: { source: string }) => {
  const translations = useStreamdownTranslations();

  return (
    <div className={markdownContainerClassName}>
      <Streamdown {...streamdownCommonProps} mode="static" translations={translations}>
        {source}
      </Streamdown>
    </div>
  );
};
