import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { DevOnly } from "../environment/DevOnly";
import { Trans } from "@lingui/react/macro";

/* eslint-disable @typescript-eslint/no-deprecated -- Inject failure at the execCommand boundary used by the installed Lexical clipboard implementation. */
/** Story-only browser failure injection; the Composer and its error handling stay unchanged. */
export function ClipboardFailurePreview({ children }: PropsWithChildren) {
  const root = useRef<HTMLDivElement>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  useEffect(() => {
    const descriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
    const original = document.execCommand.bind(document);
    const failCopy: typeof document.execCommand = (command, showUI, value) => {
      if (command === "copy" && root.current?.contains(document.activeElement)) return false;
      return original(command, showUI, value);
    };
    document.execCommand = failCopy;
    const observe = (event: PromiseRejectionEvent) => {
      if (
        event.reason instanceof Error &&
        event.reason.message === "Unable to copy the composer selection"
      ) {
        // Observe without preventing the browser's unhandled-rejection reporting.
        setDiagnostic(`unhandledrejection: ${event.reason.message}`);
      }
    };
    window.addEventListener("unhandledrejection", observe);
    return () => {
      if (descriptor == null) Reflect.deleteProperty(document, "execCommand");
      else Object.defineProperty(document, "execCommand", descriptor);
      window.removeEventListener("unhandledrejection", observe);
    };
  }, []);
  return (
    <div ref={root}>
      {children}
      <DevOnly>
        <p>
          <Trans comment="Story-only instructions for reproducing the Composer clipboard defect">
            A Skill node is selected. Press Cmd/Ctrl+C or X. This story makes
            document.execCommand('copy') return false. The Composer shows no failure feedback; the
            DEV area only observes and displays unhandledrejection. A failed cut should preserve the
            content. Switching stories restores the browser method.
          </Trans>
        </p>
        {diagnostic == null ? null : (
          <pre className="whitespace-pre-wrap break-words">{diagnostic}</pre>
        )}
      </DevOnly>
    </div>
  );
}
