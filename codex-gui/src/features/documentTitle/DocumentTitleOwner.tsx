import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useLingui } from "@lingui/react/macro";
import { useMatches } from "@tanstack/react-router";
import { useAppSelector } from "@/app/hooks";
import { selectGuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import { formatDocumentTitle, formatTaskDocumentTitle } from "./documentTitle";
import { HistoryDetailTitleContext } from "./historyDetailTitleContext";

type HistoryDetailDocumentTitleFact = Readonly<{
  registration: symbol;
  threadId: string;
  title: string;
}>;

type RegisterHistoryDetailDocumentTitleFact = (fact: HistoryDetailDocumentTitleFact) => () => void;

const HistoryDetailDocumentTitleContext =
  createContext<RegisterHistoryDetailDocumentTitleFact | null>(null);

export function DocumentTitleOwner({ children }: PropsWithChildren) {
  const { t } = useLingui();
  const routeTarget = useMatches({ select: selectGuiRouteTarget });
  const runtime = useAppSelector(selectThreadRuntimeRecord);
  const [historyDetailFacts, setHistoryDetailFacts] = useState<HistoryDetailDocumentTitleFact[]>(
    [],
  );
  const registerHistoryDetailFact = useCallback<RegisterHistoryDetailDocumentTitleFact>((fact) => {
    setHistoryDetailFacts((facts) => [...facts, fact]);
    return () => {
      setHistoryDetailFacts((facts) =>
        facts.filter((candidate) => candidate.registration !== fact.registration),
      );
    };
  }, []);

  const currentTaskLabel = t`Current task`;
  const historyLabel = t`History`;
  const historyDetailLabel = t`History detail`;
  const notFoundLabel = t`Page not found`;
  const historyDetailTitle =
    routeTarget?.type === "historyDetail"
      ? (historyDetailFacts.findLast((fact) => fact.threadId === routeTarget.threadId)?.title ??
        null)
      : null;
  let title: string;

  switch (routeTarget?.type) {
    case "currentTask":
      title =
        runtime?.threadId === routeTarget.threadId
          ? formatTaskDocumentTitle({
              name: runtime.thread.name,
              preview: runtime.thread.preview,
              fallback: currentTaskLabel,
            })
          : formatDocumentTitle(currentTaskLabel);
      break;
    case "historyList":
      title = formatDocumentTitle(historyLabel);
      break;
    case "historyDetail":
      title = formatDocumentTitle(historyDetailTitle ?? historyDetailLabel);
      break;
    default:
      title = formatDocumentTitle(notFoundLabel);
  }

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <HistoryDetailDocumentTitleContext value={registerHistoryDetailFact}>
      <HistoryDetailTitleContext value={historyDetailTitle}>{children}</HistoryDetailTitleContext>
    </HistoryDetailDocumentTitleContext>
  );
}

export function HistoryDetailDocumentTitleFactPublisher({
  threadId,
  title,
}: Readonly<{
  threadId: string;
  title: string | null;
}>) {
  const registerFact = use(HistoryDetailDocumentTitleContext);

  useEffect(() => {
    if (registerFact == null || title == null) {
      return;
    }

    return registerFact({
      registration: Symbol("history-detail-document-title"),
      threadId,
      title,
    });
  }, [registerFact, threadId, title]);

  return null;
}
