import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { inspectButtonCss, inspectButtons } from "./core";

test("rejects missing compact sizes through aliases and namespaces", () => {
  const source = `import {Button as Action} from "@heroui/react";
    import * as UI from "@heroui/react";
    function ForkNotice() { return <><Action/><UI.Button size="md"/></>; }`;
  expect(inspectButtons("ThreadForkNotice.tsx", source).errors).toHaveLength(2);
});

test("accepts native group inheritance and render prop forwarding", () => {
  const source = `import {Button, ButtonGroup} from "@heroui/react";
    function ComposerPendingInputTrigger() { return <ButtonGroup size="sm"><Button render={props => <button {...props}/>}/></ButtonGroup>; }`;
  expect(inspectButtons("ComposerPendingInputDrawer.tsx", source).errors).toEqual([]);
  expect(
    inspectButtons("ThreadForkNotice.tsx", "function ForkNotice() { return <button/>; }").errors,
  ).toHaveLength(1);
});

test("does not treat an explicit dynamic child size as group inheritance", () => {
  const source = `import {Button, ButtonGroup} from "@heroui/react";
    function ComposerPendingInputTrigger() { return <ButtonGroup size="sm"><Button size={expanded ? "md" : "sm"}/></ButtonGroup>; }`;
  expect(inspectButtons("ComposerPendingInputDrawer.tsx", source).errors).toHaveLength(1);
});

test("checks retry proxies without shrinking independent pagination", () => {
  const source = `import {RetryActionButton as Retry} from "@/feedback/RetryActionButton";
    function HistoryError() { return <Retry/>; }
    function HistoryListContent() { return <Retry/>; }`;
  expect(inspectButtons("ThreadHistoryListPage.tsx", source).errors).toHaveLength(1);
  expect(
    inspectButtons("ThreadHistoryListPage.tsx", source.replace("<Retry/>", '<Retry size="sm"/>'))
      .errors,
  ).toEqual([]);
});

test("rejects overrides even when compact size is present", () => {
  const source = `import {Button} from "@heroui/react";
    function ForkNotice() { return <Button size="sm" className="md:h-12 px-8"/>; }`;
  expect(inspectButtons("ThreadForkNotice.tsx", source).errors).toHaveLength(1);
});

test("keeps excluded buttons and library triggers outside compact enforcement", () => {
  expect(
    inspectButtons(
      "NotFoundPage.tsx",
      `import {Button, Modal} from "@heroui/react";
    function NotFoundPage(){return <><Button size="lg"/><Modal.CloseTrigger/></>}`,
    ).errors,
  ).toEqual([]);
  expect(
    inspectButtons(
      "UploadedImagePreview.tsx",
      `import {Button} from "@heroui/react";
    function UploadedImagePreview(){return <Button className="h-auto p-1"/>}`,
    ).errors,
  ).toEqual([]);
});

test("checks diagnostic defaults and explicit proxy sizes", () => {
  expect(
    inspectButtons(
      "FailureDiagnosticModal.tsx",
      `function FailureDiagnosticModal({triggerSize = "md"}) {}`,
    ).errors,
  ).toHaveLength(1);
  expect(
    inspectButtons(
      "FailureDiagnosticModal.tsx",
      `function FailureDiagnosticModal({triggerSize = "sm"}) {}`,
    ).errors,
  ).toEqual([]);
  expect(
    inspectButtons(
      "Notice.tsx",
      `import {FailureDiagnosticModal as Diagnostic} from "@/feedback/FailureDiagnosticModal"; const view = <Diagnostic triggerSize="md"/>;`,
    ).errors,
  ).toHaveLength(1);
});

test("detects global CSS sizing independently of JSX", () => {
  expect(inspectButtonCss("src/styles/extra.css", ".button { height: 12px; }").errors).toHaveLength(
    1,
  );
  expect(inspectButtonCss("src/styles/extra.css", ".button { color: red; }").errors).toEqual([]);
  expect(
    inspectButtonCss(
      "src/feedback/failureLayout.css",
      ".failure-layout .button { height: auto; min-height: 2.5rem; }",
    ).errors,
  ).toEqual([]);
  expect(
    inspectButtonCss("src/feedback/failureLayout.css", ".failure-layout .button { height: 12px; }")
      .errors,
  ).toHaveLength(1);
  expect(
    inspectButtonCss("src/feedback/failureLayout.css", ".button { padding: 10px; }").errors,
  ).toHaveLength(1);
});

test("protects the real return-to-task and queue-group scenario boundaries", () => {
  for (const relativePath of [
    "features/threadHistory/ContinueTaskFailureAlert.tsx",
    "features/composerTurnControl/ComposerPendingInputList.tsx",
  ]) {
    const source = readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), "utf8");
    expect(inspectButtons(relativePath, source).errors).toEqual([]);
    expect(
      inspectButtons(relativePath, source.replaceAll('size="sm"', "")).errors.length,
    ).toBeGreaterThan(0);
  }
});

test("protects buttonVariants styled triggers through import aliases", () => {
  const source = `import {buttonVariants as styles} from "@heroui/react"; styles({size:"sm"});`;
  expect(inspectButtons("MarkdownTableCopyMenu.tsx", source).errors).toEqual([]);
  expect(
    inspectButtons("MarkdownTableCopyMenu.tsx", source.replace('size:"sm"', 'size:"md"')).errors,
  ).toHaveLength(1);
});
