import { Button, ScrollShadow, Surface } from "@heroui/react";
import { listboxItemVariants, listboxVariants } from "@heroui/styles";
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

export type SkillTypeaheadPlacement = "above" | "below";

export type SkillTypeaheadPluginProps = Readonly<{
  isComposingRef: RefObject<boolean>;
  onRetry: (() => void) | undefined;
  placement: SkillTypeaheadPlacement;
  portalParent: HTMLElement;
  skillCatalog: SkillCatalogState;
}>;

const SKILL_TRIGGER = /(^|\s|\()(\$([^\s$]{0,75}))$/u;
const SKILL_MENU_LISTBOX_CLASS_NAME = listboxVariants({ variant: "default" });
const SKILL_MENU_LISTBOX_ITEM_CLASS_NAME = listboxItemVariants({
  variant: "default",
}).item();

export function SkillTypeaheadPlugin({
  isComposingRef,
  onRetry,
  placement,
  portalParent,
  skillCatalog,
}: SkillTypeaheadPluginProps) {
  const [editor] = useLexicalComposerContext();
  const menuId = `composer-skill-menu-${useId()}`;
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
          anchorElementRef={anchorElementRef}
          editor={editor}
          menuId={menuId}
          onRetry={onRetry}
          placement={placement}
          {...itemProps}
          skillCatalog={skillCatalog}
        />
      ),
    [editor, menuId, onRetry, placement, query, skillCatalog],
  );
  const anchorClassName = skillMenuAnchorClassName(placement);

  return (
    <LexicalTypeaheadMenuPlugin<SkillMenuOption>
      anchorClassName={anchorClassName}
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

function skillMenuAnchorClassName(placement: SkillTypeaheadPlacement): string {
  const className =
    "composer-skill-menu-anchor pointer-events-none relative! top-auto! left-auto! h-fit! w-full!";
  return placement === "below"
    ? `${className} mt-2 max-h-[calc(var(--composer-skill-menu-max-height)-0.5rem)]`
    : `${className} max-h-[var(--composer-skill-menu-max-height)]`;
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
  anchorElementRef,
  editor,
  menuId,
  onRetry,
  options,
  placement,
  selectedIndex,
  selectOptionAndCleanUp,
  setHighlightedIndex,
  skillCatalog,
}: Readonly<{
  anchorElement: HTMLElement;
  anchorElementRef: RefObject<HTMLElement | null>;
  editor: LexicalEditor;
  menuId: string;
  onRetry: (() => void) | undefined;
  options: SkillMenuOption[];
  placement: SkillTypeaheadPlacement;
  selectedIndex: number | null;
  selectOptionAndCleanUp: (option: SkillMenuOption) => void;
  setHighlightedIndex: (index: number) => void;
  skillCatalog: SkillCatalogState;
}>) {
  const showNoResults =
    options.length === 0 &&
    skillCatalog.type !== "initialLoading" &&
    skillCatalog.type !== "failed";
  const activeOption = selectedIndex == null ? null : (options[selectedIndex] ?? null);

  useEffect(() => {
    const anchorElement = anchorElementRef.current;
    const rootElement = editor.getRootElement();
    if (anchorElement == null || rootElement == null) {
      return;
    }
    const activeOptionId = selectedIndex == null ? null : skillMenuOptionId(menuId, selectedIndex);
    const synchronizeIds = (): void => {
      if (anchorElement.id !== menuId) {
        anchorElement.id = menuId;
      }
      if (rootElement.getAttribute("aria-controls") !== menuId) {
        rootElement.setAttribute("aria-controls", menuId);
      }
      if (
        activeOptionId != null &&
        rootElement.getAttribute("aria-activedescendant") !== activeOptionId
      ) {
        rootElement.setAttribute("aria-activedescendant", activeOptionId);
      }
    };
    synchronizeIds();
    const observer = new MutationObserver(synchronizeIds);
    observer.observe(anchorElement, { attributeFilter: ["id"], attributes: true });
    observer.observe(rootElement, {
      attributeFilter: ["aria-activedescendant", "aria-controls"],
      attributes: true,
    });
    return () => {
      observer.disconnect();
      if (rootElement.getAttribute("aria-controls") === menuId) {
        rootElement.removeAttribute("aria-controls");
      }
      if (
        activeOptionId != null &&
        rootElement.getAttribute("aria-activedescendant") === activeOptionId
      ) {
        rootElement.removeAttribute("aria-activedescendant");
      }
    };
  }, [anchorElementRef, editor, menuId, selectedIndex]);

  useLayoutEffect(() => {
    activeOption?.ref?.current?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  return createPortal(
    <Surface
      className={`pointer-events-auto flex w-full ${skillMenuSurfaceMaxHeightClassName(placement)} flex-col overflow-hidden rounded-xl border border-separator shadow-lg`}
      data-skill-menu-surface
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
        <ul className={SKILL_MENU_LISTBOX_CLASS_NAME} role="presentation">
          {options.map((option, index) => {
            const isSelected = selectedIndex === index;
            const { candidate, disambiguatingParentPath, displayName, sourceLabel } = option.result;
            const description = (
              candidate.interface?.shortDescription ??
              candidate.shortDescription ??
              candidate.description
            ).trim();
            return (
              <li
                aria-selected={isSelected}
                className={`${SKILL_MENU_LISTBOX_ITEM_CLASS_NAME} min-w-0 flex-col! items-stretch! gap-0.5! text-foreground [overflow-wrap:anywhere] data-[active=true]:bg-accent-soft data-[active=true]:text-accent-soft-foreground`}
                data-active={isSelected || undefined}
                id={skillMenuOptionId(menuId, index)}
                key={option.key}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  setHighlightedIndex(index);
                  selectOptionAndCleanUp(option);
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
                  {displayName === candidate.name ? null : (
                    <span className="min-w-0 text-xs text-muted [overflow-wrap:anywhere]">
                      ${candidate.name}
                    </span>
                  )}
                </div>
                {disambiguatingParentPath == null ? null : (
                  <div className="min-w-0 text-xs text-muted [overflow-wrap:anywhere]">
                    {sourceLabel} · {disambiguatingParentPath}
                  </div>
                )}
                {description.length === 0 ? null : (
                  <div
                    className="line-clamp-1 whitespace-normal text-sm text-muted [overflow-wrap:anywhere]"
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
    </Surface>,
    anchorElement,
  );
}

function skillMenuOptionId(menuId: string, index: number): string {
  return `${menuId}-option-${String(index)}`;
}

function skillMenuSurfaceMaxHeightClassName(placement: SkillTypeaheadPlacement): string {
  return placement === "below"
    ? "max-h-[calc(var(--composer-skill-menu-max-height)-0.5rem)]"
    : "max-h-[var(--composer-skill-menu-max-height)]";
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
