/** Initialize a preview through its real DOM without nesting test-tool act scopes in effects. */
export function initializeWhenReady(
  root: Node,
  initialize: () => boolean,
  onError: (failure: { error: unknown }) => void,
  timeoutMessage: string,
) {
  const dispose = () => {
    observer.disconnect();
    clearTimeout(timeout);
  };
  const attempt = () => {
    try {
      if (initialize()) dispose();
    } catch (error) {
      dispose();
      onError({ error });
    }
  };
  const observer = new MutationObserver(attempt);
  const timeout = setTimeout(() => {
    dispose();
    onError({ error: new Error(timeoutMessage) });
  }, 1000);
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  attempt();
  return dispose;
}
