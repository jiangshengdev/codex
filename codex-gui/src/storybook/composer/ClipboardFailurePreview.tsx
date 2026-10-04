import { useEffect, useRef, type PropsWithChildren } from "react";
import { DevOnly } from "../environment/DevOnly";
import { Trans } from "@lingui/react/macro";

/* eslint-disable @typescript-eslint/no-deprecated -- Inject failure at the execCommand boundary used by the installed Lexical clipboard implementation. */
/** Story-only browser failure injection; the Composer and its error handling stay unchanged. */
export function ClipboardFailurePreview({ children }: PropsWithChildren) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const descriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
    const original = document.execCommand.bind(document);
    const failCopy: typeof document.execCommand = (command, showUI, value) => {
      if (command === "copy" && root.current?.contains(document.activeElement)) return false;
      return original(command, showUI, value);
    };
    document.execCommand = failCopy;
    return () => {
      if (descriptor == null) Reflect.deleteProperty(document, "execCommand");
      else Object.defineProperty(document, "execCommand", descriptor);
    };
  }, []);
  return (
    <div ref={root}>
      {children}
      <DevOnly>
        <p>
          <Trans comment="Story-only instructions for exercising Composer clipboard failure feedback">
            A Skill node is selected. Press Cmd/Ctrl+C or X. This story makes
            document.execCommand('copy') return false. The Composer displays a failure toast and
            preserves the content. Switching stories restores the browser method.
          </Trans>
        </p>
      </DevOnly>
    </div>
  );
}
