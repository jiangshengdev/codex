import { describe, expect, test } from "vitest";

import { generateGuiHostContractArtifacts } from "./core";
import {
  exportedNames,
  generate,
  importedNames,
  importJavaScript,
  isRuntimeValidator,
  parseDiagnostics,
  requestValidatorBindings,
} from "./coreTestSupport";

const APP_SERVER_ARTIFACTS = [
  "appServerPayloadValidators.d.ts",
  "appServerPayloadValidators.js",
  "appServerPayloadValidators.raw.js",
  "index.ts",
  "jsonRpcEnvelopeValidators.d.ts",
  "jsonRpcEnvelopeValidators.js",
  "jsonRpcEnvelopeValidators.raw.js",
  "notificationDescriptors.ts",
  "requestDescriptors.ts",
] as const;
const GENERATED_TYPESCRIPT = APP_SERVER_ARTIFACTS.filter((fileName) => fileName.endsWith(".ts"));

describe("protocol validator artifacts", () => {
  test("preserves nullable, optional, tagged-union, and additionalProperties semantics", async () => {
    const artifacts = await generate();
    const validators = await importJavaScript(artifacts["appServerPayloadValidators.js"]);
    const responseEntry = Object.entries(validators).find(([name]) =>
      name.toLowerCase().includes("fixtureresponse"),
    );
    expect(responseEntry?.[0]).toBeDefined();
    const validate = responseEntry?.[1] as (value: unknown) => boolean;

    expect(validate({ kind: "left" })).toBe(true);
    expect(validate({ kind: "left", optionalNullable: null })).toBe(true);
    expect(validate({ kind: "right", value: "ok" })).toBe(true);
    expect(validate({ kind: "left", optionalNullable: 1 })).toBe(false);
    expect(validate({ kind: "unknown" })).toBe(false);
    expect(validate({ kind: "left", extra: true })).toBe(false);
  });

  test("emits an auxiliary validator with schema-required TypeScript fields", async () => {
    const artifacts = await generate({ selectedAuxiliarySchemaIds: ["v2/TurnError"] });
    const validators = await importJavaScript(artifacts["appServerPayloadValidators.js"]);
    const validate = validators.validateV2TurnError;
    expect(isRuntimeValidator(validate)).toBe(true);
    if (!isRuntimeValidator(validate)) throw new Error("Missing TurnError validator");

    expect(validate({ message: "failed" })).toBe(true);
    expect(validate({ message: "failed", codexErrorInfo: "other", additionalDetails: null })).toBe(
      true,
    );
    expect(validate({ codexErrorInfo: null, additionalDetails: null })).toBe(false);
    expect(validate({ message: 1 })).toBe(false);
    expect(validate({ message: "failed", codexErrorInfo: 1 })).toBe(false);
    expect(validate({ message: "failed", additionalDetails: 1 })).toBe(false);
    expect(validate("failed")).toBe(false);

    expect(artifacts["appServerPayloadValidators.d.ts"].replaceAll(/\s+/gu, "")).toContain(
      'ProtocolValidator<Partial<TurnError>&Required<Pick<TurnError,"message">>>',
    );
    expect(artifacts["appServerPayloadValidators.raw.js"]).toContain("TurnError");
    expect(
      exportedNames("appServerPayloadValidators.js", artifacts["appServerPayloadValidators.js"]),
    ).toContain("validateV2TurnError");
  });

  test("emits separate JSON-RPC envelope and selected payload ESM groups", async () => {
    const artifacts = await generate();
    const envelope = await importJavaScript(artifacts["jsonRpcEnvelopeValidators.js"]);
    const payload = await importJavaScript(artifacts["appServerPayloadValidators.js"]);

    expect(new Set(Object.keys(envelope))).toEqual(new Set(["validateJSONRPCMessage"]));
    expect(new Set(Object.keys(payload))).toEqual(
      new Set(["validateV2FixtureResponse", "validateV2SelectedNotification"]),
    );

    const validateEnvelope = envelope.validateJSONRPCMessage;
    expect(isRuntimeValidator(validateEnvelope)).toBe(true);
    if (!isRuntimeValidator(validateEnvelope)) throw new Error("Missing envelope validator");
    expect(validateEnvelope({ id: 1, method: "fixture/request", params: { any: "value" } })).toBe(
      true,
    );
    expect(validateEnvelope({ method: "fixture/notification", params: { any: "value" } })).toBe(
      true,
    );
    expect(validateEnvelope({ id: 1, result: { any: "value" } })).toBe(true);
    expect(validateEnvelope({ id: 1, error: { code: -1, message: "failed", data: {} } })).toBe(
      true,
    );
  });

  test("omits error messages from app-server groups while preserving GUI Host messages", async () => {
    const artifacts = await generate();
    const envelope = await importJavaScript(artifacts["jsonRpcEnvelopeValidators.js"]);
    const payload = await importJavaScript(artifacts["appServerPayloadValidators.js"]);
    const validateEnvelope = envelope.validateJSONRPCMessage;
    const validatePayload = payload.validateV2SelectedNotification;
    expect(isRuntimeValidator(validateEnvelope)).toBe(true);
    expect(isRuntimeValidator(validatePayload)).toBe(true);
    if (!isRuntimeValidator(validateEnvelope) || !isRuntimeValidator(validatePayload)) {
      throw new Error("Missing app-server validators");
    }

    expect(validateEnvelope([])).toBe(false);
    expect(validatePayload({})).toBe(false);
    for (const validator of [validateEnvelope, validatePayload]) {
      const errors = validator.errors;
      expect(errors).toBeTruthy();
      if (!errors) throw new Error("Expected app-server validation errors");
      expect(errors.every((error) => error.message === undefined)).toBe(true);
    }
    const generatedMessageTexts = [
      "must have required property",
      "must be object",
      "must match a schema in anyOf",
    ];
    for (const fileName of [
      "jsonRpcEnvelopeValidators.raw.js",
      "appServerPayloadValidators.raw.js",
    ]) {
      const sourceText = artifacts[fileName];
      expect(generatedMessageTexts.filter((message) => sourceText.includes(message))).toEqual([]);
    }

    const guiHostArtifacts = await generateGuiHostContractArtifacts({
      schemaBundle: {
        definitions: {
          GuiAuthenticateParams: {
            type: "object",
            properties: { token: { type: "string" } },
            required: ["token"],
          },
          GuiAuthenticateResult: {
            type: "object",
            properties: { authenticated: { type: "boolean" } },
            required: ["authenticated"],
          },
        },
      },
    });
    const guiHost = await importJavaScript(guiHostArtifacts["standaloneValidators.js"]);
    const validateGuiHost = guiHost.validateGuiAuthenticateParams;
    expect(isRuntimeValidator(validateGuiHost)).toBe(true);
    if (!isRuntimeValidator(validateGuiHost)) throw new Error("Missing GUI Host validator");
    expect(validateGuiHost({})).toBe(false);
    const guiHostErrors = validateGuiHost.errors;
    expect(guiHostErrors).toBeTruthy();
    if (!guiHostErrors) throw new Error("Expected GUI Host validation errors");
    expect(guiHostErrors.some((error) => typeof error.message === "string")).toBe(true);
  });

  test("keeps only the selected payload closure out of the shallow envelope group", async () => {
    const artifacts = await generate();
    const payloadSource = artifacts["appServerPayloadValidators.raw.js"];
    const envelopeSource = artifacts["jsonRpcEnvelopeValidators.raw.js"];

    expect(payloadSource).toContain("SelectedNotification");
    expect(payloadSource).toContain("Shared");
    expect(payloadSource).not.toContain("UnselectedNotification");
    expect(payloadSource).not.toContain("UnselectedBroken");
    expect(envelopeSource).not.toContain("SelectedNotification");
    expect(envelopeSource).not.toContain("FixtureResponse");
  });

  test("emits parseable AST-backed TypeScript and declarations", async () => {
    const artifacts = await generate();

    for (const fileName of GENERATED_TYPESCRIPT) {
      expect(parseDiagnostics(fileName, artifacts[fileName])).toEqual([]);
    }
  });

  test("fails when oxfmt reports errors", async () => {
    await expect(
      generate({
        dependencies: {
          formatTypeScript: () =>
            Promise.resolve({
              code: "not used",
              errors: [{ message: "fixture formatting failure" }],
            }),
        },
      }),
    ).rejects.toThrow(/oxfmt.*fixture formatting failure/i);
  });

  test("writes the exact code returned by oxfmt", async () => {
    const artifacts = await generate({
      dependencies: {
        formatTypeScript: (fileName: string, sourceText: string) =>
          Promise.resolve({
            code: `// formatted:${fileName}\n${sourceText}`,
            errors: [],
          }),
      },
    });

    for (const fileName of GENERATED_TYPESCRIPT) {
      expect(artifacts[fileName]).toMatch(new RegExp(`^// formatted:${fileName}`));
    }
  });

  test("keeps standalone Ajv source opaque apart from the generated header", async () => {
    const opaqueSource = '"use strict";\nrequire("ajv/dist/runtime/ucs2length");\n';
    const artifacts = await generate({
      dependencies: {
        standaloneCode: () => opaqueSource,
        bundleJavaScript: (sourceText: string) => Promise.resolve(sourceText),
      },
    });
    for (const fileName of [
      "appServerPayloadValidators.raw.js",
      "jsonRpcEnvelopeValidators.raw.js",
    ]) {
      const raw = artifacts[fileName];
      expect(raw).toMatch(/^\/\/.*generated.*\n/i);
      expect(raw.endsWith(opaqueSource)).toBe(true);
      expect(raw.slice(raw.length - opaqueSource.length)).toBe(opaqueSource);
    }
  });

  test("adds the generated header to both browser ESM bundles", async () => {
    const artifacts = await generate();

    expect(artifacts["appServerPayloadValidators.js"]).toMatch(/^\/\/.*generated.*\n/i);
    expect(artifacts["jsonRpcEnvelopeValidators.js"]).toMatch(/^\/\/.*generated.*\n/i);
  });

  test("keeps declarations and descriptors exactly aligned with each runtime group", async () => {
    const artifacts = await generate();
    const envelopeRuntime = await importJavaScript(artifacts["jsonRpcEnvelopeValidators.js"]);
    const payloadRuntime = await importJavaScript(artifacts["appServerPayloadValidators.js"]);
    const envelopeJavaScriptExports = exportedNames(
      "jsonRpcEnvelopeValidators.js",
      artifacts["jsonRpcEnvelopeValidators.js"],
    );
    const payloadJavaScriptExports = exportedNames(
      "appServerPayloadValidators.js",
      artifacts["appServerPayloadValidators.js"],
    );
    const envelopeDeclarationExports = exportedNames(
      "jsonRpcEnvelopeValidators.d.ts",
      artifacts["jsonRpcEnvelopeValidators.d.ts"],
    );
    const payloadDeclarationExports = exportedNames(
      "appServerPayloadValidators.d.ts",
      artifacts["appServerPayloadValidators.d.ts"],
    );
    const requestBindings = requestValidatorBindings(artifacts["requestDescriptors.ts"]);
    const requestImports = importedNames(
      artifacts["requestDescriptors.ts"],
      "./appServerPayloadValidators.js",
    );
    const notificationImports = importedNames(
      artifacts["notificationDescriptors.ts"],
      "./appServerPayloadValidators.js",
    );

    expect(envelopeJavaScriptExports).toEqual(new Set(["validateJSONRPCMessage"]));
    expect(new Set(Object.keys(envelopeRuntime))).toEqual(envelopeJavaScriptExports);
    expect(envelopeDeclarationExports).toEqual(envelopeJavaScriptExports);
    expect(payloadJavaScriptExports).toEqual(
      new Set(["validateV2FixtureResponse", "validateV2SelectedNotification"]),
    );
    expect(new Set(Object.keys(payloadRuntime))).toEqual(payloadJavaScriptExports);
    expect(payloadDeclarationExports).toEqual(payloadJavaScriptExports);
    expect(requestBindings).toEqual(new Map([["fixture/test", "validateV2FixtureResponse"]]));
    expect(requestImports).toEqual(new Set(["validateV2FixtureResponse"]));
    expect(notificationImports).toEqual(new Set(["validateV2SelectedNotification"]));
    expect(artifacts["notificationDescriptors.ts"]).toContain('case "fixture/selected"');
    expect(artifacts["notificationDescriptors.ts"]).toContain('case "fixture/unselected"');
    expect(artifacts["notificationDescriptors.ts"]).not.toContain(
      "validateV2UnselectedNotification",
    );
  });

  test("emits exactly the app-server artifact set without an eager validator registry", async () => {
    const artifacts = await generate();

    expect(Object.keys(artifacts).sort()).toEqual([...APP_SERVER_ARTIFACTS]);
    expect(artifacts).not.toHaveProperty("validatorRegistry.ts");
  });

  test("is byte-for-byte deterministic across complete generations", async () => {
    const first = await generate();
    const second = await generate();

    expect(second).toEqual(first);
  });
});
