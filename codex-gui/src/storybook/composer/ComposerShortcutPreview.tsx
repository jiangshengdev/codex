import { isMacAppleWebKitRuntime } from "@/features/composerEditor/composerRuntime";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerTextScenario } from "./composerTextScenario";
import { PendingInputPreview } from "./pendingInput/PendingInputScenarioView";

export function ComposerShortcutPreview({
  text = "Review this fictional change.",
  running = false,
  inputUnavailable = false,
}: Readonly<{ text?: string; running?: boolean; inputUnavailable?: boolean }>) {
  return (
    <PendingInputPreview
      key={JSON.stringify({ text, running, inputUnavailable })}
      createScenario={() => createComposerTextScenario(text, running ? "preview-active" : null)}
    >
      {(scenario) => (
        <ComposerSimulation
          scenario={scenario}
          guardCompositionEndEnter={isMacAppleWebKitRuntime()}
          inputUnavailable={inputUnavailable}
        />
      )}
    </PendingInputPreview>
  );
}
