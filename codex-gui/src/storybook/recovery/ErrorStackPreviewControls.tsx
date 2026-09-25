import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { DevOnly } from "../environment/DevOnly";
import type { createRecoveryPageScenario } from "./recoveryPageScenario";

export function ErrorStackPreviewControls({
  scenario,
}: Readonly<{ scenario: ReturnType<typeof createRecoveryPageScenario> }>) {
  const { t } = useLingui();
  const issues = useRef<string[]>([]);
  const feedback = useRef<string[]>([]);
  useEffect(() => {
    const keys = feedback.current;
    return () => {
      for (const key of keys) toast.close(key);
    };
  }, []);
  return (
    <DevOnly>
      <Button
        variant="secondary"
        onPress={() => {
          const id = `preview-${String(issues.current.length + 1)}`;
          issues.current.push(id);
          scenario.addIssue(id);
        }}
      >
        <Trans>Add simulated issue</Trans>
      </Button>
      <Button
        variant="secondary"
        onPress={() => {
          for (const id of issues.current) scenario.clearIssue(id);
          issues.current = [];
        }}
      >
        <Trans>Resolve simulated issues</Trans>
      </Button>
      <Button
        variant="secondary"
        onPress={() => {
          feedback.current.push(
            toast.info(t`Temporary feedback`, {
              description: t`This notification uses the existing Toast provider. It can temporarily cover the persistent recovery notices below it.`,
            }),
          );
        }}
      >
        <Trans>Show native toast</Trans>
      </Button>
    </DevOnly>
  );
}
