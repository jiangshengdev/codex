import { Chip, Tooltip } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  $nodesOfType,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  type EditorState,
  type NodeKey,
} from "lexical";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";

import { SkillNode, type SkillNodeState } from "./SkillNode";
import {
  projectSelectedSkillPresentation,
  type SelectedSkillPresentation,
} from "./selectedSkillPresentation";
import type { SkillPathIdentity } from "./skillQuery";

type SelectedSkillPresentationEnvironmentValue = Readonly<{
  candidates: SkillCatalogState["candidates"];
  disabled: boolean;
  documentSkillPathsByName: ReadonlyMap<string, readonly string[]>;
  invalidPaths: ReadonlySet<string>;
  invalidStatusText: string;
}>;

const SelectedSkillPresentationContext =
  createContext<SelectedSkillPresentationEnvironmentValue | null>(null);

function useSelectedSkillPresentationEnvironment(): SelectedSkillPresentationEnvironmentValue {
  const environment = use(SelectedSkillPresentationContext);
  if (environment == null) {
    throw new Error("SelectedSkillToken requires a presentation environment");
  }
  return environment;
}

const noInvalidSkillPaths: ReadonlySet<string> = new Set();
const selectedSkillDetailsMessage = msg({
  comment: "Accessible name for a selected skill details trigger",
  message: "{0} skill details",
});
const invalidSelectedSkillDetailsMessage = msg({
  comment: "Accessible name for an invalid selected skill details trigger",
  message: "{0} skill details, {1}",
});

export function SelectedSkillPresentationEnvironment({
  children,
  disabled,
  skillCatalog,
  skillValidity,
}: Readonly<{
  children: ReactNode;
  disabled: boolean;
  skillCatalog: SkillCatalogState;
  skillValidity:
    | Readonly<{
        invalidPaths: ReadonlySet<string>;
        statusText: string;
      }>
    | undefined;
}>) {
  const [editor] = useLexicalComposerContext();
  const [documentSkillPathsByName, setDocumentSkillPathsByName] = useState(() =>
    documentSkillPathsFromEditorState(editor.getEditorState()),
  );

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        const nextDocumentSkillPathsByName = documentSkillPathsFromEditorState(editorState);
        setDocumentSkillPathsByName((currentDocumentSkillPathsByName) =>
          sameDocumentSkillPaths(currentDocumentSkillPathsByName, nextDocumentSkillPathsByName)
            ? currentDocumentSkillPathsByName
            : nextDocumentSkillPathsByName,
        );
      }),
    [editor],
  );

  const value = useMemo<SelectedSkillPresentationEnvironmentValue>(
    () => ({
      candidates: skillCatalog.candidates,
      disabled,
      documentSkillPathsByName,
      invalidPaths: skillValidity?.invalidPaths ?? noInvalidSkillPaths,
      invalidStatusText: skillValidity?.statusText ?? "",
    }),
    [disabled, documentSkillPathsByName, skillCatalog.candidates, skillValidity],
  );

  return (
    <SelectedSkillPresentationContext value={value}>{children}</SelectedSkillPresentationContext>
  );
}

export function SelectedSkillToken({
  nodeKey,
  skill,
}: Readonly<{ nodeKey: NodeKey; skill: SkillNodeState }>) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const environment = useSelectedSkillPresentationEnvironment();
  const { i18n, t } = useLingui();
  const onClick = useCallback(
    (event: MouseEvent): boolean => {
      const nodeElement = editor.getElementByKey(nodeKey);
      if (environment.disabled || !nodeElement?.contains(event.target as Node)) {
        return false;
      }
      if (event.shiftKey) {
        setSelected(!isSelected);
      } else {
        clearSelection();
        setSelected(true);
      }
      return true;
    },
    [clearSelection, editor, environment.disabled, isSelected, nodeKey, setSelected],
  );

  useEffect(
    () => editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
    [editor, onClick],
  );

  const documentSkills: SkillPathIdentity[] = (
    environment.documentSkillPathsByName.get(skill.name) ?? []
  ).map((path) => ({ name: skill.name, path }));
  const presentation = projectSelectedSkillPresentation({
    skill,
    candidates: environment.candidates,
    documentSkills,
    invalidPaths: environment.invalidPaths,
  });
  const skillDisplayName = presentation.displayName;
  const invalidStatusText = environment.invalidStatusText;
  const accessibleName = presentation.isInvalid
    ? i18n._({
        ...invalidSelectedSkillDetailsMessage,
        values: { 0: skillDisplayName, 1: invalidStatusText },
      })
    : i18n._({
        ...selectedSkillDetailsMessage,
        values: { 0: skillDisplayName },
      });
  const localizedSourceLabel = (() => {
    switch (presentation.sourceLabel) {
      case "User":
        return t({
          comment: "Source label for a skill installed by the current user",
          message: "User",
        });
      case "Repository":
        return t({
          comment: "Source label for a skill provided by the current repository",
          message: "Repository",
        });
      case "System":
        return t({
          comment: "Source label for a skill provided by the Codex system",
          message: "System",
        });
      case "Admin":
        return t({
          comment: "Source label for a skill installed by an administrator",
          message: "Admin",
        });
      default:
        return presentation.sourceLabel;
    }
  })();

  useEffect(() => {
    const nodeElement = editor.getElementByKey(nodeKey);
    if (nodeElement == null) {
      return;
    }

    nodeElement.setAttribute("role", "group");
    nodeElement.setAttribute("aria-label", accessibleName);
    nodeElement.classList.toggle("selected", isSelected);
    for (const [attribute, enabled] of [
      ["aria-invalid", presentation.isInvalid],
      ["aria-disabled", environment.disabled],
      ["data-selected", isSelected],
      ["data-invalid", presentation.isInvalid],
      ["data-disabled", environment.disabled],
    ] as const) {
      if (enabled) {
        nodeElement.setAttribute(attribute, "true");
      } else {
        nodeElement.removeAttribute(attribute);
      }
    }

    return () => {
      nodeElement.classList.remove("selected");
      for (const attribute of [
        "role",
        "aria-label",
        "aria-invalid",
        "aria-disabled",
        "data-selected",
        "data-invalid",
        "data-disabled",
      ]) {
        nodeElement.removeAttribute(attribute);
      }
    };
  }, [accessibleName, editor, environment.disabled, isSelected, nodeKey, presentation.isInvalid]);

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>): void => {
    if (event.isPrimary && event.button === 0) {
      event.preventDefault();
    }
  };

  return (
    <Tooltip delay={0} isDisabled={environment.disabled}>
      <Tooltip.Trigger<"span">
        className="max-w-full align-[2px]"
        onPointerDown={onPointerDown}
        render={(props) => <span {...props} />}
        role="presentation"
        tabIndex={-1}
      >
        <Chip
          className="max-w-full whitespace-normal"
          color={presentation.isInvalid ? "danger" : isSelected ? "accent" : "default"}
          data-selected={isSelected || undefined}
          size="sm"
          variant={isSelected ? "primary" : presentation.isInvalid ? "soft" : "secondary"}
        >
          <Chip.Label className="min-w-0 [overflow-wrap:anywhere]">
            {`$${presentation.displayName}`}
          </Chip.Label>
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-xs break-words [overflow-wrap:anywhere]">
        <SelectedSkillDetails
          invalidStatusText={environment.invalidStatusText}
          localizedSourceLabel={localizedSourceLabel}
          presentation={presentation}
        />
      </Tooltip.Content>
    </Tooltip>
  );
}

function SelectedSkillDetails({
  invalidStatusText,
  localizedSourceLabel,
  presentation,
}: Readonly<{
  invalidStatusText: string;
  localizedSourceLabel: string;
  presentation: SelectedSkillPresentation;
}>) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="font-semibold [overflow-wrap:anywhere]">{presentation.displayName}</p>
      {presentation.canonicalName == null ? null : (
        <p className="text-muted [overflow-wrap:anywhere]">{presentation.canonicalName}</p>
      )}
      <p className="text-muted [overflow-wrap:anywhere]">{localizedSourceLabel}</p>
      {presentation.isInvalid ? (
        <p className="text-danger [overflow-wrap:anywhere]">{invalidStatusText}</p>
      ) : null}
      {presentation.description == null ? null : (
        <p className="mt-1 text-muted [overflow-wrap:anywhere]">{presentation.description}</p>
      )}
      {presentation.pathLabel == null ? null : (
        <p className="mt-1 text-muted [overflow-wrap:anywhere]">{presentation.pathLabel}</p>
      )}
    </div>
  );
}

function documentSkillPathsFromEditorState(
  editorState: EditorState,
): ReadonlyMap<string, readonly string[]> {
  return editorState.read(() => {
    const pathsByName = new Map<string, Set<string>>();
    for (const node of $nodesOfType(SkillNode)) {
      const skill = node.getSkill();
      const paths = pathsByName.get(skill.name) ?? new Set<string>();
      paths.add(skill.path);
      pathsByName.set(skill.name, paths);
    }
    return new Map(Array.from(pathsByName, ([name, paths]) => [name, Array.from(paths)] as const));
  });
}

function sameDocumentSkillPaths(
  left: ReadonlyMap<string, readonly string[]>,
  right: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [name, leftPaths] of left) {
    const rightPaths = right.get(name);
    if (
      rightPaths?.length !== leftPaths.length ||
      leftPaths.some((path, index) => path !== rightPaths[index])
    ) {
      return false;
    }
  }
  return true;
}
