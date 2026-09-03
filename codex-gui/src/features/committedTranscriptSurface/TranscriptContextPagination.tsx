import { Pagination } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";

type TranscriptContextPaginationProps = Readonly<{
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}>;

type PageItem = number | "leadingEllipsis" | "trailingEllipsis";

const pageItemsFor = (page: number, totalPages: number): PageItem[] => {
  const items: PageItem[] = [1];

  if (page > 3) {
    items.push("leadingEllipsis");
  }

  const firstMiddlePage = Math.max(2, page - 1);
  const lastMiddlePage = Math.min(totalPages - 1, page + 1);
  for (let middlePage = firstMiddlePage; middlePage <= lastMiddlePage; middlePage += 1) {
    items.push(middlePage);
  }

  if (page < totalPages - 2) {
    items.push("trailingEllipsis");
  }

  items.push(totalPages);
  return items;
};

export const TranscriptContextPagination = ({
  page,
  totalPages,
  onPageChange,
}: TranscriptContextPaginationProps) => {
  const { t } = useLingui();

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="-my-1 w-full overflow-x-auto py-1">
      <Pagination
        aria-label={t({
          comment: "Accessible name for pagination between transcript context generations",
          message: "Transcript context pages",
        })}
        className="justify-center"
        size="sm"
      >
        <Pagination.Content className="gap-2 px-1">
          <Pagination.Item>
            <Pagination.Previous
              aria-label={t({
                comment: "Accessible name for the previous transcript context page button",
                message: "Previous context page",
              })}
              isDisabled={page === 1}
              onPress={() => {
                onPageChange(page - 1);
              }}
            >
              <Pagination.PreviousIcon />
              <span>
                <Trans>Previous</Trans>
              </span>
            </Pagination.Previous>
          </Pagination.Item>
          {pageItemsFor(page, totalPages).map((pageItem) => {
            if (typeof pageItem === "number") {
              const pageNumber = pageItem;
              const item = String(pageNumber);
              return (
                <Pagination.Item key={pageNumber}>
                  <Pagination.Link
                    aria-label={t({
                      comment: "Accessible name for a numbered transcript context page button",
                      message: `Context page ${item}`,
                    })}
                    isActive={pageNumber === page}
                    onPress={() => {
                      onPageChange(pageNumber);
                    }}
                  >
                    {pageNumber}
                  </Pagination.Link>
                </Pagination.Item>
              );
            }

            return (
              <Pagination.Item key={pageItem}>
                <Pagination.Ellipsis />
              </Pagination.Item>
            );
          })}
          <Pagination.Item>
            <Pagination.Next
              aria-label={t({
                comment: "Accessible name for the next transcript context page button",
                message: "Next context page",
              })}
              isDisabled={page === totalPages}
              onPress={() => {
                onPageChange(page + 1);
              }}
            >
              <span>
                <Trans>Next</Trans>
              </span>
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
    </div>
  );
};
