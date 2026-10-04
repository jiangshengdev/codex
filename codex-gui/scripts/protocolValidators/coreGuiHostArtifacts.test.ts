import path from "node:path";

import { describe, expect, test } from "vitest";

import { generateGuiHostContractArtifacts, loadGuiHostContractInputs } from "./core";
import {
  exportedNames,
  exportedObject,
  generate,
  identifierBindings,
  importJavaScript,
  isRuntimeValidator,
} from "./coreTestSupport";

const GUI_HOST_ARTIFACTS = [
  "index.ts",
  "standaloneValidators.d.ts",
  "standaloneValidators.js",
  "standaloneValidators.raw.js",
  "validatorRegistry.ts",
] as const;
const APP_SERVER_SCHEMA_BUNDLE_ID = "https://openai.com/codex/app-server-protocol.schema.json";
const GUI_HOST_SCHEMA_BUNDLE_ID = "https://openai.com/codex/gui-host-browser-contract.schema.json";

describe("GUI Host contract validator source group", () => {
  test("uses an independent browser-contract schema identity", async () => {
    const schemaDirectory = path.resolve(
      import.meta.dirname,
      "../../../codex-rs/gui-host/schema/json",
    );
    const inputs = await loadGuiHostContractInputs({
      paramsSchemaPath: path.join(schemaDirectory, "GuiAuthenticateParams.json"),
      resultSchemaPath: path.join(schemaDirectory, "GuiAuthenticateResult.json"),
    });

    const appServerArtifacts = await generate();
    const guiHostArtifacts = await generateGuiHostContractArtifacts(inputs);

    expect(appServerArtifacts["jsonRpcEnvelopeValidators.raw.js"]).toContain(
      APP_SERVER_SCHEMA_BUNDLE_ID,
    );
    expect(appServerArtifacts["jsonRpcEnvelopeValidators.raw.js"]).not.toContain(
      GUI_HOST_SCHEMA_BUNDLE_ID,
    );
    expect(guiHostArtifacts["standaloneValidators.raw.js"]).toContain(GUI_HOST_SCHEMA_BUNDLE_ID);
    expect(guiHostArtifacts["standaloneValidators.raw.js"]).not.toContain(
      APP_SERVER_SCHEMA_BUNDLE_ID,
    );
  });

  test("loads both real Rust schemas and emits only the registry profile", async () => {
    const schemaDirectory = path.resolve(
      import.meta.dirname,
      "../../../codex-rs/gui-host/schema/json",
    );
    const inputs = await loadGuiHostContractInputs({
      paramsSchemaPath: path.join(schemaDirectory, "GuiAuthenticateParams.json"),
      resultSchemaPath: path.join(schemaDirectory, "GuiAuthenticateResult.json"),
    });

    const artifacts = await generateGuiHostContractArtifacts(inputs);

    expect(Object.keys(artifacts).sort()).toEqual([...GUI_HOST_ARTIFACTS]);
    expect(Object.values(artifacts).join("\n")).toContain("GuiAuthenticateParams");
    expect(Object.values(artifacts).join("\n")).toContain("GuiAuthenticateResult");
  });

  test("exports a public authenticate-result validator with Rust schema semantics", async () => {
    const schemaDirectory = path.resolve(
      import.meta.dirname,
      "../../../codex-rs/gui-host/schema/json",
    );
    const inputs = await loadGuiHostContractInputs({
      paramsSchemaPath: path.join(schemaDirectory, "GuiAuthenticateParams.json"),
      resultSchemaPath: path.join(schemaDirectory, "GuiAuthenticateResult.json"),
    });
    const artifacts = await generateGuiHostContractArtifacts(inputs);
    const validators = await importJavaScript(artifacts["standaloneValidators.js"]);
    const validate = validators.validateGuiAuthenticateResult;

    expect(isRuntimeValidator(validate)).toBe(true);
    if (!isRuntimeValidator(validate)) {
      throw new Error("Missing validateGuiAuthenticateResult runtime export");
    }
    expect(validate({ authenticated: true })).toBe(true);
    expect(validate({})).toBe(false);
    expect(validate({ authenticated: "yes" })).toBe(false);
    expect(validate({ authenticated: true, futureField: "accepted by Rust serde" })).toBe(true);

    const publicExports = exportedNames("index.ts", artifacts["index.ts"]);
    expect(publicExports).toContain("validateGuiAuthenticateResult");
    expect(
      identifierBindings(exportedObject(artifacts["validatorRegistry.ts"], "validatorRegistry")),
    ).toEqual(
      new Map([
        ["GuiAuthenticateParams", "validateGuiAuthenticateParams"],
        ["GuiAuthenticateResult", "validateGuiAuthenticateResult"],
      ]),
    );
  });

  test("is byte-for-byte deterministic", async () => {
    const schemaDirectory = path.resolve(
      import.meta.dirname,
      "../../../codex-rs/gui-host/schema/json",
    );
    const inputs = await loadGuiHostContractInputs({
      paramsSchemaPath: path.join(schemaDirectory, "GuiAuthenticateParams.json"),
      resultSchemaPath: path.join(schemaDirectory, "GuiAuthenticateResult.json"),
    });

    const first = await generateGuiHostContractArtifacts(inputs);
    const second = await generateGuiHostContractArtifacts(inputs);

    expect(second).toEqual(first);
  });
});
