import { Button, Modal } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Maximize2 } from "lucide-react";
import { use, useRef, type ComponentProps } from "react";
import { StreamdownContext, type Components } from "streamdown";
import { MarkdownTableCopyMenu } from "./MarkdownTableCopyMenu";
import { useMarkdownTableScroll } from "./useMarkdownTableScroll";

type MarkdownTableProps = ComponentProps<Exclude<NonNullable<Components["table"]>, string>>;

export function MarkdownTable({ children, node: _node, className, ...props }: MarkdownTableProps) {
  const { t } = useLingui();
  const { isAnimating } = use(StreamdownContext);
  const { tableRef, scrollRef, onScroll } = useMarkdownTableScroll();
  const fullscreenTableRef = useRef<HTMLTableElement>(null);
  const tableClassName = `w-full border-collapse text-sm ${className ?? ""}`;
  return (
    <div data-streamdown="table-wrapper" className="my-4 min-w-0 rounded-lg p-1">
      <div className="flex items-start justify-end gap-1 pb-1">
        <MarkdownTableCopyMenu tableRef={tableRef} />
        <Modal>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            isDisabled={isAnimating}
            aria-label={t({
              message: "View fullscreen",
              comment: "Open the Markdown table in a fullscreen dialog.",
            })}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </Button>
          <Modal.Backdrop>
            <Modal.Container size="full" scroll="inside">
              <Modal.Dialog data-streamdown="table-fullscreen">
                <Modal.CloseTrigger
                  aria-label={t({
                    message: "Exit fullscreen",
                    comment: "Close the fullscreen Markdown table dialog.",
                  })}
                />
                <Modal.Header>
                  <Modal.Heading>
                    {t({
                      message: "View fullscreen",
                      comment: "Open the Markdown table in a fullscreen dialog.",
                    })}
                  </Modal.Heading>
                  <div className="pr-10">
                    <MarkdownTableCopyMenu tableRef={fullscreenTableRef} />
                  </div>
                </Modal.Header>
                <Modal.Body className="min-w-0 overflow-auto">
                  <table
                    {...props}
                    ref={fullscreenTableRef}
                    data-streamdown="table"
                    className={tableClassName}
                  >
                    {children}
                  </table>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[300px] overflow-auto rounded-md border border-border"
      >
        <table {...props} ref={tableRef} data-streamdown="table" className={tableClassName}>
          {children}
        </table>
      </div>
    </div>
  );
}
