import { Modal } from "@heroui/react";
import { useEffect, useRef, type ComponentProps } from "react";

export function ReadingModalHeading({
  children,
  className,
}: Pick<ComponentProps<typeof Modal.Heading>, "children" | "className">) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Nested FocusScopes register during layout. Focus after that registration,
    // before the parent dialog's passive fallback, so containment accepts the title.
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <Modal.Heading ref={headingRef} tabIndex={-1} className={className}>
      {children}
    </Modal.Heading>
  );
}
