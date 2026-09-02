import { createRef, useState, type CSSProperties, type RefObject } from "react";
import { expect } from "vitest";

import type { AppLocale } from "@/i18n";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";
import { renderWithProviders } from "@/utils/test-utils";

import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorProps,
} from "../ComposerEditor";

type RenderEditorOptions = Readonly<{
  guardCompositionEndEnter?: boolean;
  locale?: AppLocale;
  onSubmit?: ComposerEditorProps["onSubmit"];
}>;

export async function renderEditor(
  candidates: readonly SkillCatalogCandidate[],
  {
    guardCompositionEndEnter = false,
    locale = "en",
    onSubmit = () => undefined,
  }: RenderEditorOptions = {},
) {
  const controllerRef = createRef<ComposerEditorController>();
  const skillCatalog: SkillCatalogState = {
    type: "ready",
    candidates,
    partialErrorCount: 0,
  };
  const screen = await renderWithProviders(
    <ComposerEditorFixture
      ariaLabel="Message"
      controllerRef={controllerRef}
      disabled={false}
      guardCompositionEndEnter={guardCompositionEndEnter}
      onSubmit={onSubmit}
      placeholder="Message Codex"
      skillCatalog={skillCatalog}
    />,
    { locale },
  );
  await expect.poll(() => controllerRef.current).not.toBeNull();
  return { controllerRef, screen };
}

export function ComposerEditorFixture(props: Omit<ComposerEditorProps, "skillMenuParent">) {
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);

  return (
    <div className="w-96 max-w-full">
      <div ref={setSkillMenuParent} style={fixtureSkillMenuParentStyle} />
      <ComposerEditor {...props} skillMenuParent={skillMenuParent} />
    </div>
  );
}

const fixtureSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "18rem",
} as CSSProperties;

export function catalog(
  type: SkillCatalogState["type"],
  candidates: readonly SkillCatalogCandidate[],
  partialErrorCount = 0,
): SkillCatalogState {
  const contents = { candidates, partialErrorCount };
  switch (type) {
    case "initialLoading":
      return { type: "initialLoading", ...contents };
    case "ready":
      return { type: "ready", ...contents };
    case "refreshing":
      return { type: "refreshing", ...contents };
    case "stale":
      return { type: "stale", ...contents };
    case "failed":
      return { type: "failed", ...contents };
  }
}

type SkillCatalogCandidateWithInterface = SkillCatalogCandidate &
  Readonly<{ interface: NonNullable<SkillCatalogCandidate["interface"]> }>;

export function skill(
  name: string,
  path: string,
  displayName = name,
  description = `${name} description`,
  scope: SkillCatalogCandidate["scope"] = "repo",
): SkillCatalogCandidateWithInterface {
  return {
    name,
    path,
    description,
    scope,
    interface: { displayName, iconSmallUrl: null, iconLargeUrl: null },
  };
}

export function getController(
  ref: RefObject<ComposerEditorController | null>,
): ComposerEditorController {
  if (ref.current == null) {
    throw new Error("composer controller must be ready");
  }
  return ref.current;
}
