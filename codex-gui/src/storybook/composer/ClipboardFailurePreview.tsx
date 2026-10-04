import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { DevOnly } from "../environment/DevOnly";

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
      {diagnostic == null ? null : (
        <DevOnly>
          <pre className="whitespace-pre-wrap break-words">{diagnostic}</pre>
        </DevOnly>
      )}
    </div>
  );
}
