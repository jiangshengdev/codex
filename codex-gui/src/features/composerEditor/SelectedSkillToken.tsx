import { Chip, Tooltip } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  $nodesOfType,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type EditorState,
  type NodeKey,
} from "lexical";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";

import { activateSkillNode, SkillNode, type SkillNodeState } from "./SkillNode";
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
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const environment = use(SelectedSkillPresentationContext);
  const { i18n, t } = useLingui();
  if (environment == null) {
    throw new Error("SelectedSkillToken requires a presentation environment");
  }

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

  const activate = (): void => {
    if (!environment.disabled) {
      activateSkillNode(editor, nodeKey);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (environment.disabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      activate();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      event.stopPropagation();
      if (activateSkillNode(editor, nodeKey) === "activated") {
        editor.dispatchCommand(
          event.key === "Backspace" ? KEY_BACKSPACE_COMMAND : KEY_DELETE_COMMAND,
          event.nativeEvent,
        );
      }
    }
  };

  return (
    <Tooltip isDisabled={environment.disabled}>
      <Tooltip.Trigger<"span">
        aria-disabled={environment.disabled || undefined}
        aria-invalid={presentation.isInvalid || undefined}
        aria-label={accessibleName}
        className="max-w-full align-middle"
        onClick={activate}
        onKeyDown={onKeyDown}
        render={(props) => <span {...props} />}
        tabIndex={environment.disabled ? -1 : 0}
      >
        <Chip
          className={
            isSelected
              ? "max-w-full whitespace-normal status-focused"
              : "max-w-full whitespace-normal"
          }
          color={presentation.isInvalid ? "danger" : "default"}
          data-selected={isSelected || undefined}
          size="sm"
          variant={presentation.isInvalid ? "soft" : "secondary"}
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
