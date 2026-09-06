import {
  createContext,
  StrictMode,
  use,
  useEffect,
  useLayoutEffect,
  useState,
  type ComponentProps,
} from "react";
import { render } from "vitest-browser-react";
import { afterEach, expect, test, vi } from "vitest";
import { CatchBoundary } from "@tanstack/react-router";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ComposerEditorController } from "@/features/composerEditor/ComposerEditor";
import type { ComposerPendingInputEditorProps } from "../ComposerPendingInputEditor";
import { ComposerPendingInputEditorAdapter } from "../ComposerPendingInputEditorAdapter";
import { createComposerPendingInputSession } from "../composerPendingInputSession";
import {
  pendingInputItem,
  queueSnapshot,
} from "./composerTurnControlPendingInputBrowserTestSupport";

const ControllerContext = createContext<ComposerEditorController | null>(null);

vi.mock("../ComposerPendingInputEditor", () => ({
  ComposerPendingInputEditor: ({ onControllerChange }: ComposerPendingInputEditorProps) => {
    const controller = use(ControllerContext);
    useEffect(() => {
      onControllerChange(controller);
      return () => {
        onControllerChange(null);
      };
    }, [controller, onControllerChange]);
    return null;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

type AdapterProps = ComponentProps<typeof ComposerPendingInputEditorAdapter>;

function createController(): ComposerEditorController {
  return {
    getSnapshot: () => ({ textContent: "", selectedSkillPaths: [] }),
    subscribe: () => () => undefined,
    capture: vi.fn<ComposerEditorController["capture"]>(),
    clearIfCurrent: () => false,
    restore: vi.fn<ComposerEditorController["restore"]>(),
    focus: vi.fn<ComposerEditorController["focus"]>(),
    getRootElement: () => null,
  };
}

function createFixture() {
  const pendingInputSession = createComposerPendingInputSession();
  const attach = vi.spyOn(pendingInputSession, "attachEditor").mockReturnValue({ type: "applied" });
  const detach = vi.spyOn(pendingInputSession, "detachEditor").mockImplementation(() => undefined);
  const props: AdapterProps = {
    controllerRef: { current: null },
    edit: {
      phase: "preparing",
      preparationToken: 1,
      item: pendingInputItem("pending", "ordinary", {
        type: "text",
        text: "Draft",
        truncated: false,
      }),
    },
    facts: {
      composerRole: createActiveThreadSessionHarness().composerRole,
      sessionRevision: 1,
      mutationsEnabled: true,
      snapshot: queueSnapshot(),
    },
    guardCompositionEndEnter: false,
    onRetrySkillCatalog: vi.fn<AdapterProps["onRetrySkillCatalog"]>(),
    pendingInputSession,
    skillCatalog: { type: "ready", candidates: [], partialErrorCount: 0 },
  };
  return { props, attach, detach };
}

test("attaches once after StrictMode effect replay without detaching the preparing edit", async () => {
  const { props, attach, detach } = createFixture();
  const controller = createController();
  const screen = await render(
    <StrictMode>
      <ControllerContext value={controller}>
        <ComposerPendingInputEditorAdapter {...props} />
      </ControllerContext>
    </StrictMode>,
  );

  expect(attach).toHaveBeenCalledOnce();
  expect(attach.mock.calls[0]?.[0].restore).toBe(controller.restore);
  expect(detach).not.toHaveBeenCalled();
  expect(props.controllerRef.current?.controller).toBe(controller);

  await screen.unmount();
  expect(detach).toHaveBeenCalledExactlyOnceWith(props.facts, props.edit.preparationToken);
  expect(props.controllerRef.current).toBeNull();
});

test("invalidates an old controller when a committed update replaces it before attachment", async () => {
  const { props, attach, detach } = createFixture();
  const previous = createController();
  const current = createController();
  function Harness() {
    const [replaced, setReplaced] = useState(false);
    useLayoutEffect(() => {
      setReplaced(true);
    }, []);
    return (
      <ControllerContext value={replaced ? current : previous}>
        <ComposerPendingInputEditorAdapter {...props} />
      </ControllerContext>
    );
  }

  await render(<Harness />);

  expect(attach).toHaveBeenCalledOnce();
  expect(attach.mock.calls[0]?.[0].restore).toBe(current.restore);
  expect(detach).not.toHaveBeenCalled();
  expect(props.controllerRef.current?.controller).toBe(current);
});

test("cleans up a preparing editor that unmounts before attachment", async () => {
  const { props, attach, detach } = createFixture();
  const controller = createController();
  function Harness() {
    const [closed, setClosed] = useState(false);
    useLayoutEffect(() => {
      setClosed(true);
    }, []);
    return closed ? null : (
      <ControllerContext value={controller}>
        <ComposerPendingInputEditorAdapter {...props} />
      </ControllerContext>
    );
  }

  await render(<Harness />);

  expect(attach).not.toHaveBeenCalled();
  expect(detach).toHaveBeenCalledExactlyOnceWith(props.facts, props.edit.preparationToken);
  expect(props.controllerRef.current).toBeNull();
});

test("attaches with the latest committed facts", async () => {
  const { props, attach } = createFixture();
  const controller = createController();
  const latestFacts = { ...props.facts, sessionRevision: 2, mutationsEnabled: false };
  function Harness() {
    const [updated, setUpdated] = useState(false);
    useLayoutEffect(() => {
      setUpdated(true);
    }, []);
    return (
      <ControllerContext value={controller}>
        <ComposerPendingInputEditorAdapter {...props} facts={updated ? latestFacts : props.facts} />
      </ControllerContext>
    );
  }

  await render(<Harness />);

  expect(attach).toHaveBeenCalledOnce();
  expect(attach.mock.calls[0]?.[0].facts).toBe(latestFacts);
});

test("reports an attachment failure through the React error boundary", async () => {
  const { props, attach } = createFixture();
  const controller = createController();
  const failure = new Error("Draft restoration failed");
  const onCatch = vi.fn<NonNullable<ComponentProps<typeof CatchBoundary>["onCatch"]>>();
  attach.mockImplementation(() => {
    throw failure;
  });

  const screen = await render(
    <CatchBoundary
      getResetKey={() => "pending-editor"}
      onCatch={onCatch}
      errorComponent={({ error }) => <div role="alert">{error.message}</div>}
    >
      <ControllerContext value={controller}>
        <ComposerPendingInputEditorAdapter {...props} />
      </ControllerContext>
    </CatchBoundary>,
  );

  await expect.element(screen.getByRole("alert")).toHaveTextContent(failure.message);
  expect(onCatch).toHaveBeenCalledOnce();
  expect(onCatch.mock.calls[0]?.[0]).toBe(failure);
  expect(props.controllerRef.current).toBeNull();
});
