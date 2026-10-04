import { useEffect, useRef, useState } from "react";

export function useMarkdownCopyFeedback(onErrorChange?: (failed: boolean) => void) {
  const [status, setStatus] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const copy = async (write: () => Promise<void>) => {
    clearTimeout(timer.current);
    setStatus("pending");
    onErrorChange?.(false);
    try {
      await write();
      if (!mounted.current) return;
      setStatus("copied");
      timer.current = setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch {
      if (mounted.current) {
        setStatus("failed");
        onErrorChange?.(true);
      }
    }
  };

  return { status, copy };
}
