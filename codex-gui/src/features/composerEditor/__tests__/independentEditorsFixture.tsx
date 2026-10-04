import { useState, type CSSProperties, type RefObject } from "react";

import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorProps,
} from "../ComposerEditor";
import { catalog, skill } from "./composerEditorBrowserTestSupport";

export function IndependentEditorsFixture({
  firstControllerRef,
  firstSubmit,
  secondControllerRef,
  secondSubmit,
}: Readonly<{
  firstControllerRef: RefObject<ComposerEditorController | null>;
  firstSubmit: ComposerEditorProps["onSubmit"];
  secondControllerRef: RefObject<ComposerEditorController | null>;
  secondSubmit: ComposerEditorProps["onSubmit"];
}>) {
  const [firstMenuParent, setFirstMenuParent] = useState<HTMLElement | null>(null);
  const [secondMenuParent, setSecondMenuParent] = useState<HTMLElement | null>(null);
  const skillCatalog = catalog("ready", [skill("alpha", "/alpha")]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div
          aria-label="First skill suggestions"
          ref={setFirstMenuParent}
          role="region"
          style={fixtureSkillMenuParentStyle}
        />
        <ComposerEditor
          submitIntents={["ordinary", "guide"]}
          ariaLabel="First message"
          controllerRef={firstControllerRef}
          disabled={false}
          guardCompositionEndEnter={false}
          onSubmit={firstSubmit}
          placeholder="First message"
          skillCatalog={skillCatalog}
          skillMenuParent={firstMenuParent}
        />
      </div>
      <div>
        <div
          aria-label="Second skill suggestions"
          ref={setSecondMenuParent}
          role="region"
          style={fixtureSkillMenuParentStyle}
        />
        <ComposerEditor
          submitIntents={["ordinary", "guide"]}
          ariaLabel="Second message"
          controllerRef={secondControllerRef}
          disabled={false}
          guardCompositionEndEnter={false}
          onSubmit={secondSubmit}
          placeholder="Second message"
          skillCatalog={skillCatalog}
          skillMenuParent={secondMenuParent}
        />
      </div>
    </div>
  );
}

const fixtureSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "18rem",
} as CSSProperties;
