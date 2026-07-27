import { Button, Link, Typography } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-24 text-foreground sm:py-32 lg:px-8">
      <div className="text-center">
        <Typography className="text-accent" type="body" weight="semibold">
          404
        </Typography>
        <Typography.Heading
          className="mt-4 text-5xl tracking-tight text-balance sm:text-7xl"
          level={1}
          weight="semibold"
        >
          <Trans>Page not found</Trans>
        </Typography.Heading>
        <Typography.Paragraph
          className="mt-6 text-lg text-pretty sm:text-xl/8"
          color="muted"
          size="base"
          weight="medium"
        >
          <Trans>Sorry, we couldn’t find the page you’re looking for.</Trans>
        </Typography.Paragraph>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button size="lg" onPress={() => void navigate({ to: "/" })}>
            <Trans>Go back home</Trans>
          </Button>
          <Link href="mailto:jiangshengdev@outlook.com" className="text-sm font-semibold">
            <Trans comment="Link on the not-found page that opens an email to support">
              Contact support
            </Trans>{" "}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
