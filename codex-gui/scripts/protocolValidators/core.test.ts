import path from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

import {
  generateGuiHostContractArtifacts,
  generateProtocolArtifacts,
  loadGuiHostContractInputs,
  loadProtocolInputs,
} from "./core";

const SELECTED_REQUEST_METHODS = [
  "initialize",
  "thread/projection/attach",
  "turn/start",
  "turn/interrupt",
] as const;

const SELECTED_NOTIFICATION_METHODS = [
  "thread/projection/event",
  "thread/projection/delta",
  "thread/projection/closed",
] as const;
const FIXTURE_REQUEST_METHODS = ["fixture/test"] as const;
const FIXTURE_NOTIFICATION_METHODS = ["fixture/selected"] as const;
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
const GUI_HOST_ARTIFACTS = [
  "index.ts",
  "standaloneValidators.d.ts",
  "standaloneValidators.js",
  "standaloneValidators.raw.js",
  "validatorRegistry.ts",
] as const;
const APP_SERVER_SCHEMA_BUNDLE_ID = "https://openai.com/codex/app-server-protocol.schema.json";
const GUI_HOST_SCHEMA_BUNDLE_ID = "https://openai.com/codex/gui-host-browser-contract.schema.json";

type JsonObject = Record<string, unknown>;

function requestDefinitions(): JsonObject[] {
  return [
    {
      method: "fixture/test",
      paramsSchema: "v2/FixtureParams",
      responseSchema: "v2/FixtureResponse",
    },
  ];
}

function notificationDefinitions(): JsonObject[] {
  return [
    { method: "fixture/selected", paramsSchema: "v2/SelectedNotification" },
    { method: "fixture/unselected", paramsSchema: "v2/UnselectedNotification" },
  ];
}

function schemaBundle(): JsonObject {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    definitions: {
      JSONRPCMessage: {
        anyOf: [
          { $ref: "#/definitions/JSONRPCRequest" },
          { $ref: "#/definitions/JSONRPCNotification" },
          { $ref: "#/definitions/JSONRPCResponse" },
          { $ref: "#/definitions/JSONRPCError" },
        ],
      },
      JSONRPCRequest: {
        type: "object",
        properties: {
          id: { $ref: "#/definitions/RequestId" },
          method: { type: "string" },
          params: true,
        },
        required: ["id", "method"],
      },
      JSONRPCNotification: {
        type: "object",
        properties: { method: { type: "string" }, params: true },
        required: ["method"],
      },
      JSONRPCResponse: {
        type: "object",
        properties: { id: { $ref: "#/definitions/RequestId" }, result: true },
        required: ["id", "result"],
      },
      JSONRPCError: {
        type: "object",
        properties: {
          id: { $ref: "#/definitions/RequestId" },
          error: { $ref: "#/definitions/JSONRPCErrorError" },
        },
        required: ["id", "error"],
      },
      JSONRPCErrorError: {
        type: "object",
        properties: {
          code: { type: "integer" },
          message: { type: "string" },
          data: true,
        },
        required: ["code", "message"],
      },
      RequestId: { anyOf: [{ type: "string" }, { type: "integer" }] },
      v2: {
        FixtureParams: {
          type: "object",
          additionalProperties: false,
          properties: { shared: { $ref: "#/definitions/v2/Shared" } },
          required: ["shared"],
        },
        FixtureResponse: {
          $defs: {
            Left: {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { const: "left" },
                optionalNullable: { type: ["string", "null"] },
              },
              required: ["kind"],
            },
            Right: {
              type: "object",
              additionalProperties: false,
              properties: { kind: { const: "right" }, value: { type: "string" } },
              required: ["kind", "value"],
            },
          },
          oneOf: [
            { $ref: "#/definitions/v2/FixtureResponse/$defs/Left" },
            { $ref: "#/definitions/v2/FixtureResponse/$defs/Right" },
          ],
        },
        Shared: { type: "string", minLength: 1 },
        SelectedNotification: {
          type: "object",
          additionalProperties: false,
          properties: { value: { $ref: "#/definitions/v2/Shared" } },
          required: ["value"],
        },
        UnselectedNotification: {
          type: "object",
          additionalProperties: false,
          properties: { ignored: { type: "boolean" } },
          required: ["ignored"],
        },
        UnselectedBroken: { $ref: "#/definitions/v2/DoesNotExist" },
      },
    },
  };
}

async function generate(
  overrides: {
    schemaBundle?: JsonObject;
    requestDefinitions?: JsonObject[];
    notificationDefinitions?: JsonObject[];
    selectedRequestMethods?: readonly string[];
    selectedNotificationMethods?: readonly string[];
    dependencies?: JsonObject;
  } = {},
) {
  return generateProtocolArtifacts({
    schemaBundle: overrides.schemaBundle ?? schemaBundle(),
    requestDefinitions: overrides.requestDefinitions ?? requestDefinitions(),
    notificationDefinitions: overrides.notificationDefinitions ?? notificationDefinitions(),
    selectedRequestMethods: overrides.selectedRequestMethods ?? FIXTURE_REQUEST_METHODS,
    selectedNotificationMethods:
      overrides.selectedNotificationMethods ?? FIXTURE_NOTIFICATION_METHODS,
    dependencies: overrides.dependencies,
  });
}

function nestedDefinitions(bundle: JsonObject): JsonObject {
  return (bundle.definitions as JsonObject).v2 as JsonObject;
}

function parseDiagnostics(fileName: string, sourceText: string): readonly ts.Diagnostic[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  return (sourceFile as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics;
}

function exportedNames(fileName: string, sourceText: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add(element.name.text);
      }
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }

  return names;
}

function propertyNameText(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw new Error(`Unsupported generated property name: ${name.getText()}`);
}

function exportedObject(sourceText: string, variableName: string): ts.ObjectLiteralExpression {
  const sourceFile = ts.createSourceFile(
    `${variableName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variableName) continue;
      let initializer = declaration.initializer;
      while (
        initializer &&
        (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer))
      ) {
        initializer = initializer.expression;
      }
      if (initializer && ts.isObjectLiteralExpression(initializer)) return initializer;
    }
  }
  throw new Error(`Missing generated object export: ${variableName}`);
}

function identifierBindings(object: ts.ObjectLiteralExpression): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.initializer)) {
      throw new Error(`Expected generated identifier binding: ${property.getText()}`);
    }
    bindings.set(propertyNameText(property.name), property.initializer.text);
  }
  return bindings;
}

function requestValidatorBindings(sourceText: string): Map<string, string> {
  const descriptors = exportedObject(sourceText, "requestDescriptors");
  const bindings = new Map<string, string>();
  for (const property of descriptors.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
      throw new Error(`Expected generated request descriptor: ${property.getText()}`);
    }
    const validator = property.initializer.properties.find(
      (candidate): candidate is ts.PropertyAssignment =>
        ts.isPropertyAssignment(candidate) &&
        propertyNameText(candidate.name) === "validateResponse",
    );
    if (!validator || !ts.isIdentifier(validator.initializer)) {
      throw new Error(`Missing generated response validator: ${property.getText()}`);
    }
    bindings.set(propertyNameText(property.name), validator.initializer.text);
  }
  return bindings;
}

function importedNames(sourceText: string, moduleName: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    "imports.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== moduleName) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return new Set();
    return new Set(bindings.elements.map(({ name }) => name.text));
  }
  return new Set();
}

async function importJavaScript(sourceText: string): Promise<Record<string, unknown>> {
  return import(
    `data:text/javascript;base64,${Buffer.from(sourceText).toString("base64")}`
  ) as Promise<Record<string, unknown>>;
}

function isRuntimeValidator(value: unknown): value is (input: unknown) => boolean {
  return typeof value === "function";
}

describe("protocol validator input selection", () => {
  test("loads real Rust request and notification metadata", async () => {
    const schemaDirectory = path.resolve(
      import.meta.dirname,
      "../../../codex-rs/app-server-protocol/schema/json",
    );
    const inputs = await loadProtocolInputs({
      schemaBundlePath: path.join(schemaDirectory, "codex_app_server_protocol.schemas.json"),
      requestDefinitionsPath: path.join(schemaDirectory, "client-request-definitions.json"),
      notificationDefinitionsPath: path.join(
        schemaDirectory,
        "server-notification-definitions.json",
      ),
    });

    const loadedRequestMethods = inputs.requestDefinitions.map(({ method }) => method);
    const loadedNotificationMethods = inputs.notificationDefinitions.map(({ method }) => method);
    for (const method of SELECTED_REQUEST_METHODS) expect(loadedRequestMethods).toContain(method);
    for (const method of SELECTED_NOTIFICATION_METHODS) {
      expect(loadedNotificationMethods).toContain(method);
    }
    const artifacts = await generateProtocolArtifacts({
      ...inputs,
      selectedRequestMethods: SELECTED_REQUEST_METHODS,
      selectedNotificationMethods: SELECTED_NOTIFICATION_METHODS,
    });

    expect(artifacts["appServerPayloadValidators.raw.js"]).toContain(
      "ThreadProjectionEventNotification",
    );
    expect(artifacts["appServerPayloadValidators.raw.js"]).not.toContain(
      "windowsSandbox/setupCompleted",
    );
    expect(artifacts["jsonRpcEnvelopeValidators.raw.js"]).not.toContain(
      "ThreadProjectionEventNotification",
    );
  });

  test("rejects a selected request missing from metadata", async () => {
    await expect(generate({ selectedRequestMethods: ["fixture/missing"] })).rejects.toThrow(
      /selected method.*fixture\/missing.*metadata/i,
    );
  });

  test.each([
    ["params", "v2/MissingParams"],
    ["response", "v2/MissingResponse"],
  ])("rejects a selected %s schema missing from the bundle", async (kind, schemaId) => {
    const definitions = requestDefinitions();
    definitions[0] = {
      ...definitions[0],
      [`${kind}Schema`]: schemaId,
    };

    await expect(generate({ requestDefinitions: definitions })).rejects.toThrow(
      new RegExp(`${kind} schema.*${schemaId}`, "i"),
    );
  });

  test("rejects duplicate request methods", async () => {
    await expect(
      generate({ requestDefinitions: [...requestDefinitions(), ...requestDefinitions()] }),
    ).rejects.toThrow(/duplicate method.*fixture\/test/i);
  });

  test("rejects duplicate notification methods", async () => {
    await expect(
      generate({
        notificationDefinitions: [
          ...notificationDefinitions(),
          ...notificationDefinitions().slice(0, 1),
        ],
      }),
    ).rejects.toThrow(/duplicate.*notification.*fixture\/selected/i);
  });

  test("rejects a selected notification missing from metadata", async () => {
    await expect(generate({ selectedNotificationMethods: ["fixture/missing"] })).rejects.toThrow(
      /selected notification.*fixture\/missing.*metadata/i,
    );
  });

  test("rejects a selected notification params schema missing from the bundle", async () => {
    const definitions = notificationDefinitions();
    definitions[0] = { ...definitions[0], paramsSchema: "v2/MissingNotification" };

    await expect(generate({ notificationDefinitions: definitions })).rejects.toThrow(
      /notification.*params schema.*v2\/MissingNotification/i,
    );
  });

  test("rejects duplicate schema ids in the selected closure", async () => {
    const bundle = schemaBundle();
    const v2 = nestedDefinitions(bundle);
    v2.FixtureResponse = { ...(v2.FixtureResponse as JsonObject), $id: "duplicate-id" };
    v2.Shared = { ...(v2.Shared as JsonObject), $id: "duplicate-id" };

    await expect(generate({ schemaBundle: bundle })).rejects.toThrow(
      /duplicate schema.*duplicate-id/i,
    );
  });

  test("walks the selected response and notification closures", async () => {
    const artifacts = await generate();
    const payloadSource = artifacts["appServerPayloadValidators.raw.js"];

    expect(payloadSource).not.toContain("FixtureParams");
    expect(payloadSource).toContain("FixtureResponse");
    expect(payloadSource).toContain("SelectedNotification");
    expect(payloadSource).toContain("Shared");
    expect(payloadSource).toContain("Left");
    expect(payloadSource).toContain("Right");
  });

  test("rejects an unresolved ref inside the selected closure", async () => {
    const bundle = schemaBundle();
    nestedDefinitions(bundle).Shared = { $ref: "#/definitions/v2/DoesNotExist" };

    await expect(generate({ schemaBundle: bundle })).rejects.toThrow(
      /unresolved.*#\/definitions\/v2\/DoesNotExist/i,
    );
  });

  test("ignores an unresolved ref outside the selected closure", async () => {
    await expect(generate()).resolves.toBeDefined();
  });

  test("does not traverse selected params schemas after confirming they exist", async () => {
    const bundle = schemaBundle();
    nestedDefinitions(bundle).FixtureParams = {
      $id: "shared-id",
      $ref: "#/definitions/v2/MissingParamsDependency",
    };
    nestedDefinitions(bundle).Shared = {
      ...(nestedDefinitions(bundle).Shared as JsonObject),
      $id: "shared-id",
    };

    await expect(generate({ schemaBundle: bundle })).resolves.toBeDefined();
  });
});

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
