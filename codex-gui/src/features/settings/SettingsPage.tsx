import { Button, Surface, Typography } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPrimarySurfaceNavigation } from "@/features/appRuntime/primarySurfaceNavigation";
import { LanguageAutocomplete } from "./LanguageAutocomplete";

const focusChatReturnTarget = (): void => {
  const target =
    document.querySelector<HTMLElement>("[data-settings-trigger]") ??
    document.querySelector<HTMLElement>("[data-chat-main]");
  target?.focus({ preventScroll: true });
};

export function SettingsPage() {
  const navigate = useNavigate();
  const primarySurfaceNavigation = createPrimarySurfaceNavigation(navigate);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const onBack = async (): Promise<void> => {
    await primarySurfaceNavigation.returnToChat();
    focusChatReturnTarget();
  };

  return (
    <main
      className="min-h-svh bg-background px-4 py-6 text-foreground sm:px-6 sm:py-10"
      data-testid="settings-route"
    >
      <div className="mx-auto grid w-full max-w-3xl gap-8">
        <div className="grid justify-items-start gap-6">
          <Button
            onPress={() => {
              void onBack();
            }}
            variant="tertiary"
          >
            <ArrowLeft aria-hidden="true" size={18} />
            <Trans comment="Button that returns from settings to the chat page">Back</Trans>
          </Button>
          <div className="grid gap-2">
            <Typography.Heading level={1} ref={headingRef} tabIndex={-1}>
              <Trans>Settings</Trans>
            </Typography.Heading>
            <Typography.Paragraph color="muted">
              <Trans comment="Settings page description; Codex GUI is the product name">
                Manage Codex GUI preferences on this device.
              </Trans>
            </Typography.Paragraph>
          </div>
        </div>

        <section aria-labelledby="settings-language-heading">
          <Surface className="grid gap-4 rounded-3xl p-6" variant="default">
            <div className="grid gap-1">
              <Typography.Heading id="settings-language-heading" level={2}>
                <Trans comment="Heading for the interface language settings section">
                  Language
                </Trans>
              </Typography.Heading>
              <Typography.Paragraph color="muted" size="sm">
                <Trans>Choose the interface language.</Trans>
              </Typography.Paragraph>
            </div>
            <LanguageAutocomplete />
          </Surface>
        </section>
      </div>
    </main>
  );
}
