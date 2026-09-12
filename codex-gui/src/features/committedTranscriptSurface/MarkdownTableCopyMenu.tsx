import { Alert, Dropdown, buttonVariants } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Copy } from "lucide-react";
import { use, useEffect, useRef, useState, type RefObject } from "react";
import {
  StreamdownContext,
  extractTableDataFromElement,
  tableDataToCSV,
  tableDataToMarkdown,
  tableDataToTSV,
} from "streamdown";

export function MarkdownTableCopyMenu({
  tableRef,
}: {
  tableRef: RefObject<HTMLTableElement | null>;
}) {
  const { t } = useLingui();
  const { isAnimating } = use(StreamdownContext);
  const [result, setResult] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const available =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof (navigator as Partial<Pick<Navigator, "clipboard">>).clipboard?.write === "function" &&
    typeof ClipboardItem === "function";
  if (!available) return null;

  const copy = async (
    serialize: (data: ReturnType<typeof extractTableDataFromElement>) => string,
  ) => {
    const table = tableRef.current;
    if (!table) return;
    clearTimeout(timer.current);
    setResult("pending");
    try {
      const content = serialize(extractTableDataFromElement(table));
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([content], { type: "text/plain" }),
          "text/html": new Blob([table.outerHTML], { type: "text/html" }),
        }),
      ]);
      if (!mounted.current) return;
      setResult("copied");
      timer.current = setTimeout(() => {
        setResult("idle");
      }, 2000);
    } catch {
      if (mounted.current) setResult("failed");
    }
  };

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <Dropdown>
        <Dropdown.Trigger
          aria-label={t({
            message: "Copy table",
            comment: "Opens the Markdown table copy format menu.",
          })}
          className={buttonVariants({ variant: "ghost", size: "sm", isIconOnly: true })}
          isDisabled={isAnimating}
          isPending={result === "pending"}
        >
          {result === "copied" ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu>
            <Dropdown.Item
              id="markdown"
              textValue="Markdown"
              onAction={() => {
                void copy(tableDataToMarkdown);
              }}
            >
              Markdown
            </Dropdown.Item>
            <Dropdown.Item
              id="csv"
              textValue="CSV"
              onAction={() => {
                void copy(tableDataToCSV);
              }}
            >
              CSV
            </Dropdown.Item>
            <Dropdown.Item
              id="tsv"
              textValue="TSV"
              onAction={() => {
                void copy(tableDataToTSV);
              }}
            >
              TSV
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {result === "copied" && (
        <span role="status" className="text-xs text-muted">
          {t({ message: "Table copied", comment: "Table clipboard write succeeded." })}
        </span>
      )}
      {result === "failed" && (
        <Alert status="danger" role="alert">
          <Alert.Content>
            <Alert.Description>
              {t({
                message: "Could not copy table. Try again.",
                comment: "Table clipboard write failed; the copy menu remains available for retry.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
