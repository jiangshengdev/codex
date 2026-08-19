import { Button, ScrollShadow, Separator, Surface } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type MenuRenderFn,
  type MenuTextMatch,
  type TriggerFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  COMPOSITION_START_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
  type TextNode,
} from "lexical";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";

import { $createSkillNode } from "./SkillNode";
import { querySkills, type SkillQueryResult } from "./skillQuery";

export type SkillTypeaheadPluginProps = Readonly<{
  isComposingRef: RefObject<boolean>;
  onRetry: (() => void) | undefined;
  portalParent: HTMLElement;
  skillCatalog: SkillCatalogState;
}>;

const SKILL_TRIGGER = /(^|\s|\()(\$([^\s$]{0,75}))$/u;

export function SkillTypeaheadPlugin({
  isComposingRef,
  onRetry,
  portalParent,
  skillCatalog,
}: SkillTypeaheadPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(
    () =>
      query == null
        ? []
        : querySkills(skillCatalog.candidates, query).map((result) => new SkillMenuOption(result)),
    [query, skillCatalog.candidates],
  );
  const clearQueryForComposition = useCallback(() => {
    setQuery(null);
    editor.dispatchCommand(
      KEY_ESCAPE_COMMAND,
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
    );
  }, [editor]);

  useEffect(
    () =>
      editor.registerCommand(
        COMPOSITION_START_COMMAND,
        () => {
          clearQueryForComposition();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [clearQueryForComposition, editor],
  );

  useEffect(() => {
    let currentRoot: HTMLElement | null = null;
    const unregisterRootListener = editor.registerRootListener(
      (rootElement, previousRootElement) => {
        previousRootElement?.removeEventListener("compositionstart", clearQueryForComposition);
        currentRoot?.removeEventListener("compositionstart", clearQueryForComposition);
        configureComboboxRoot(previousRootElement, false);
        configureComboboxRoot(rootElement, true);
        currentRoot = rootElement;
        currentRoot?.addEventListener("compositionstart", clearQueryForComposition);
      },
    );

    return () => {
      currentRoot?.removeEventListener("compositionstart", clearQueryForComposition);
      currentRoot = null;
      unregisterRootListener();
    };
  }, [clearQueryForComposition, editor]);

  const triggerFn = useCallback<TriggerFn>(
    (text, lexicalEditor) => {
      if (isComposingRef.current || lexicalEditor.isComposing()) {
        return null;
      }
      return matchSkillTrigger(text);
    },
    [isComposingRef],
  );

  const onQueryChange = useCallback(
    (nextQuery: string | null) => {
      setQuery(isComposingRef.current ? null : nextQuery);
    },
    [isComposingRef],
  );

  const onSelectOption = useCallback(
    (option: SkillMenuOption, textNodeContainingQuery: TextNode | null, closeMenu: () => void) => {
      if (isComposingRef.current || editor.isComposing() || textNodeContainingQuery == null) {
        return;
      }

      const { candidate, displayName, sourceLabel } = option.result;
      const skillNode = $createSkillNode({
        name: candidate.name,
        path: candidate.path,
        displayName,
        sourceLabel,
      });
      textNodeContainingQuery.replace(skillNode);
      skillNode.selectNext();
      closeMenu();
    },
    [editor, isComposingRef],
  );

  const onOpen = useCallback(() => {
    setComboboxExpanded(editor, true);
  }, [editor]);

  const onClose = useCallback(() => {
    setQuery(null);
    setComboboxExpanded(editor, false);
  }, [editor]);

  const menuRenderFn = useCallback<MenuRenderFn<SkillMenuOption>>(
    (anchorElementRef, itemProps) =>
      anchorElementRef.current == null || query == null ? null : (
        <SkillMenu
          anchorElement={anchorElementRef.current}
          onRetry={onRetry}
          {...itemProps}
          skillCatalog={skillCatalog}
        />
      ),
    [onRetry, query, skillCatalog],
  );

  return (
    <LexicalTypeaheadMenuPlugin<SkillMenuOption>
      anchorClassName="composer-skill-menu-anchor pointer-events-none relative! top-auto! left-auto! h-fit! w-full! max-h-[var(--composer-skill-menu-max-height)]"
      ignoreEntityBoundary={false}
      menuRenderFn={menuRenderFn}
      onClose={onClose}
      onOpen={onOpen}
      onQueryChange={onQueryChange}
      onSelectOption={onSelectOption}
      options={options}
      parent={portalParent}
      preselectFirstItem
      triggerFn={triggerFn}
    />
  );
}

class SkillMenuOption extends MenuOption {
  readonly result: SkillQueryResult;

  constructor(result: SkillQueryResult) {
    super(result.candidate.path);
    this.result = result;
  }
}

function SkillMenu({
  anchorElement,
  onRetry,
  options,
  selectedIndex,
  selectOptionAndCleanUp,
  setHighlightedIndex,
  skillCatalog,
}: Readonly<{
  anchorElement: HTMLElement;
  onRetry: (() => void) | undefined;
  options: SkillMenuOption[];
  selectedIndex: number | null;
  selectOptionAndCleanUp: (option: SkillMenuOption) => void;
  setHighlightedIndex: (index: number) => void;
  skillCatalog: SkillCatalogState;
}>) {
  const activeDetailsId = useId();
  const [hoveredOptionKey, setHoveredOptionKey] = useState<string | null>(null);
  const showNoResults =
    options.length === 0 &&
    skillCatalog.type !== "initialLoading" &&
    skillCatalog.type !== "failed";
  const activeOption = selectedIndex == null ? null : (options[selectedIndex] ?? null);
  const hoveredOption =
    hoveredOptionKey == null
      ? null
      : (options.find((option) => option.key === hoveredOptionKey) ?? null);
  const previewOption = hoveredOption ?? activeOption;

  useLayoutEffect(() => {
    activeOption?.ref?.current?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  return createPortal(
    <Surface
      className="pointer-events-auto flex w-full max-h-[var(--composer-skill-menu-max-height)] flex-col overflow-hidden rounded-xl border border-separator shadow-lg"
      onPointerLeave={() => {
        setHoveredOptionKey(null);
      }}
      variant="secondary"
    >
      <SkillCatalogStatus onRetry={onRetry} skillCatalog={skillCatalog} />
      {showNoResults ? (
        <p aria-live="polite" className="px-3 py-2 text-sm text-muted" role="status">
          <Trans>No matching skills</Trans>
        </p>
      ) : null}
      <ScrollShadow
        className="min-h-0 flex-1"
        data-scrollbar="thin"
        data-skill-menu-scroll-region
        hideScrollBar={false}
        orientation="vertical"
        visibility="auto"
      >
        <ul className="p-1" role="presentation">
          {options.map((option, index) => {
            const isSelected = selectedIndex === index;
            const isHovered = hoveredOptionKey === option.key;
            const { candidate, disambiguatingParentPath, displayName, sourceLabel } = option.result;
            const description = (
              candidate.interface?.shortDescription ??
              candidate.shortDescription ??
              candidate.description
            ).trim();
            return (
              <li
                aria-describedby={isSelected ? activeDetailsId : undefined}
                aria-selected={isSelected}
                className={`min-h-11 cursor-default rounded-lg border-l-2 px-3 py-2 outline-none [overflow-wrap:anywhere] ${
                  isSelected
                    ? "border-accent bg-accent-soft text-accent-soft-foreground"
                    : isHovered
                      ? "border-transparent bg-surface-hover text-foreground ring-1 ring-inset ring-separator"
                      : "border-transparent text-foreground"
                }`}
                data-active={isSelected || undefined}
                data-hovered={isHovered || undefined}
                id={`typeahead-item-${String(index)}`}
                key={option.key}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  setHighlightedIndex(index);
                  selectOptionAndCleanUp(option);
                }}
                onPointerEnter={() => {
                  setHoveredOptionKey(option.key);
                }}
                onPointerLeave={() => {
                  setHoveredOptionKey((currentKey) =>
                    currentKey === option.key ? null : currentKey,
                  );
                }}
                ref={(element) => {
                  option.setRefElement(element);
                }}
                role="option"
              >
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                    {displayName}
                  </span>
                  <span className="min-w-0 text-xs text-muted [overflow-wrap:anywhere]">
                    ${candidate.name}
                  </span>
                  <span className="ml-auto min-w-0 text-xs text-muted [overflow-wrap:anywhere]">
                    {sourceLabel}
                    {disambiguatingParentPath == null ? null : <> · {disambiguatingParentPath}</>}
                  </span>
                </div>
                {description.length === 0 ? null : (
                  <div
                    className="line-clamp-2 whitespace-normal text-sm text-muted [overflow-wrap:anywhere]"
                    data-skill-description
                  >
                    {description}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollShadow>
      {activeOption == null || previewOption == null ? null : (
        <>
          <Separator variant="tertiary" />
          <div
            className="max-h-24 min-w-0 shrink-0 overflow-y-auto px-3 py-2 text-xs text-muted [overflow-wrap:anywhere]"
            data-skill-menu-details
          >
            <span className="sr-only" id={activeDetailsId}>
              {skillOptionDetails(activeOption)}
            </span>
            <div aria-hidden="true" data-skill-menu-detail-preview>
              {skillOptionDetails(previewOption)}
            </div>
          </div>
        </>
      )}
    </Surface>,
    anchorElement,
  );
}

function skillOptionDetails(option: SkillMenuOption): string {
  return `${option.result.sourceLabel} · ${option.result.candidate.path}`;
}

function SkillCatalogStatus({
  onRetry,
  skillCatalog,
}: Readonly<{
  onRetry: (() => void) | undefined;
  skillCatalog: SkillCatalogState;
}>) {
  const status = catalogStatus(skillCatalog);
  if (status == null) {
    return null;
  }

  const canRetryCatalog =
    skillCatalog.type === "failed" ||
    skillCatalog.type === "stale" ||
    skillCatalog.partialErrorCount > 0;

  return (
    <div
      aria-live="polite"
      className="flex items-center justify-between gap-2 border-b border-separator px-3 py-2 text-sm text-muted"
      role="status"
    >
      <span>{status}</span>
      {onRetry != null && canRetryCatalog ? (
        <Button onPress={onRetry} size="sm" variant="secondary">
          <Trans>Retry</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function catalogStatus(skillCatalog: SkillCatalogState) {
  switch (skillCatalog.type) {
    case "initialLoading":
      return <Trans>Loading skills…</Trans>;
    case "refreshing":
      return <Trans>Refreshing skills…</Trans>;
    case "failed":
      return <Trans>Skills could not be loaded</Trans>;
    case "stale":
      return <Trans>Showing saved skills because refresh failed</Trans>;
    case "ready":
      return skillCatalog.partialErrorCount > 0 ? (
        <Trans>Some skills could not be loaded</Trans>
      ) : null;
  }
}

function matchSkillTrigger(text: string): MenuTextMatch | null {
  const match = SKILL_TRIGGER.exec(text);
  if (match == null) {
    return null;
  }

  const leadingBoundary = match[1] ?? "";
  const replaceableString = match[2] ?? "";
  return {
    leadOffset: match.index + leadingBoundary.length,
    matchingString: match[3] ?? "",
    replaceableString,
  };
}

function setComboboxExpanded(editor: LexicalEditor, isOpen: boolean): void {
  const rootElement = editor.getRootElement();
  if (rootElement == null) {
    return;
  }

  if (isOpen) {
    rootElement.setAttribute("aria-expanded", "true");
  } else {
    rootElement.setAttribute("aria-expanded", "false");
  }
}

function configureComboboxRoot(rootElement: HTMLElement | null, isMounted: boolean): void {
  if (rootElement == null) {
    return;
  }

  if (isMounted) {
    rootElement.setAttribute("role", "combobox");
    rootElement.setAttribute("aria-haspopup", "listbox");
    rootElement.setAttribute("aria-expanded", "false");
  } else {
    rootElement.setAttribute("role", "textbox");
    rootElement.removeAttribute("aria-haspopup");
    rootElement.removeAttribute("aria-expanded");
    rootElement.removeAttribute("aria-activedescendant");
  }
}
