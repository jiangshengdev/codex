import { useState, type CSSProperties } from "react";

import { ComposerEditor, type ComposerEditorProps } from "../ComposerEditor";

export function ComposerEditorFixture(
  props: Omit<ComposerEditorProps, "skillMenuParent" | "submitIntents"> &
    Partial<Pick<ComposerEditorProps, "submitIntents">>,
) {
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);

  return (
    <div className="w-96 max-w-full">
      <div ref={setSkillMenuParent} style={fixtureSkillMenuParentStyle} />
      <ComposerEditor
        submitIntents={["ordinary", "guide"]}
        {...props}
        skillMenuParent={skillMenuParent}
      />
    </div>
  );
}

const fixtureSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "18rem",
} as CSSProperties;
