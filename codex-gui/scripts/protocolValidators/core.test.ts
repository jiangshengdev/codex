import path from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

import { generateProtocolArtifacts, loadProtocolInputs } from "./core";

const SELECTED_METHODS = [
  "initialize",
  "thread/projection/attach",
  "turn/start",
  "turn/interrupt",
] as const;

const FIXTURE_METHODS = ["fixture/test"] as const;
const GENERATED_TYPESCRIPT = [
  "standaloneValidators.d.ts",
  "validatorRegistry.ts",
  "requestDescriptors.ts",
  "notificationDescriptors.ts",
  "index.ts",
] as const;

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

function schemaBundle(): JsonObject {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    definitions: {
      JSONRPCMessage: {
        anyOf: [
          { $ref: "#/definitions/JSONRPCResponse" },
          { $ref: "#/definitions/ServerNotification" },
        ],
      },
      JSONRPCResponse: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "integer" }, result: true },
        required: ["id", "result"],
      },
      ServerNotification: {
        type: "object",
        additionalProperties: false,
        properties: {
          method: { const: "fixture/event" },
          params: { $ref: "#/definitions/v2/FixtureEvent" },
        },
        required: ["method", "params"],
      },
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
        FixtureEvent: {
          type: "object",
          additionalProperties: false,
          properties: { value: { $ref: "#/definitions/v2/Shared" } },
          required: ["value"],
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
    selectedMethods?: readonly string[];
    dependencies?: JsonObject;
  } = {},
) {
  return generateProtocolArtifacts({
    schemaBundle: overrides.schemaBundle ?? schemaBundle(),
    requestDefinitions: overrides.requestDefinitions ?? requestDefinitions(),
    selectedMethods: overrides.selectedMethods ?? FIXTURE_METHODS,
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

function notificationExportBinding(sourceText: string): string {
  const sourceFile = ts.createSourceFile(
    "notificationDescriptors.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue;
    if (!ts.isNamedExports(statement.exportClause)) continue;
    const exported = statement.exportClause.elements.find(
      ({ name }) => name.text === "validateServerNotification",
    );
    if (exported) return exported.propertyName?.text ?? exported.name.text;
  }
  throw new Error("Missing generated validateServerNotification export");
}

async function importJavaScript(sourceText: string): Promise<Record<string, unknown>> {
  return import(
    `data:text/javascript;base64,${Buffer.from(sourceText).toString("base64")}`
  ) as Promise<Record<string, unknown>>;
}

describe("protocol validator input selection", () => {
  test("loads the complete vendored Rust bundle and request metadata", async () => {
    const schemaDirectory = path.resolve(
      import.meta.dirname,
      "../../../codex-rs/app-server-protocol/schema/json",
    );
    const inputs = await loadProtocolInputs({
      schemaBundlePath: path.join(schemaDirectory, "codex_app_server_protocol.schemas.json"),
      requestDefinitionsPath: path.join(schemaDirectory, "client-request-definitions.json"),
    });

    const loadedMethods = inputs.requestDefinitions.map(({ method }) => method);
    for (const method of SELECTED_METHODS) expect(loadedMethods).toContain(method);
    const artifacts = await generateProtocolArtifacts({
      ...inputs,
      selectedMethods: SELECTED_METHODS,
    });
    expect(typeof artifacts["standaloneValidators.raw.js"]).toBe("string");
    expect(typeof artifacts["standaloneValidators.js"]).toBe("string");
    expect(typeof artifacts["requestDescriptors.ts"]).toBe("string");
  });

  test("rejects a selected method missing from request metadata", async () => {
    await expect(generate({ selectedMethods: ["fixture/missing"] })).rejects.toThrow(
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

  test("rejects duplicate schema ids in the selected closure", async () => {
    const bundle = schemaBundle();
    const v2 = nestedDefinitions(bundle);
    v2.FixtureResponse = { ...(v2.FixtureResponse as JsonObject), $id: "duplicate-id" };
    v2.Shared = { ...(v2.Shared as JsonObject), $id: "duplicate-id" };

    await expect(generate({ schemaBundle: bundle })).rejects.toThrow(
      /duplicate schema.*duplicate-id/i,
    );
  });

  test("walks transitive definitions and $defs references", async () => {
    const artifacts = await generate();
    const joined = Object.values(artifacts).join("\n");

    expect(joined).toContain("FixtureParams");
    expect(joined).toContain("FixtureResponse");
    expect(joined).toContain("Shared");
    expect(joined).toContain("Left");
    expect(joined).toContain("Right");
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
    const validators = await importJavaScript(artifacts["standaloneValidators.js"]);
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
    const raw = artifacts["standaloneValidators.raw.js"];

    expect(raw).toMatch(/^\/\/.*generated.*\n/i);
    expect(raw.endsWith(opaqueSource)).toBe(true);
    expect(raw.slice(raw.length - opaqueSource.length)).toBe(opaqueSource);
  });

  test("adds the generated header to the browser ESM bundle", async () => {
    const artifacts = await generate();

    expect(artifacts["standaloneValidators.js"]).toMatch(/^\/\/.*generated.*\n/i);
  });

  test("keeps runtime exports and all generated bindings exactly consistent", async () => {
    const artifacts = await generate();
    const runtimeModule = await importJavaScript(artifacts["standaloneValidators.js"]);
    const javascriptExports = exportedNames(
      "standaloneValidators.js",
      artifacts["standaloneValidators.js"],
    );
    const declarationExports = exportedNames(
      "standaloneValidators.d.ts",
      artifacts["standaloneValidators.d.ts"],
    );
    const runtimeExports = new Set(Object.keys(runtimeModule));
    const registryBindings = identifierBindings(
      exportedObject(artifacts["validatorRegistry.ts"], "validatorRegistry"),
    );
    const requestBindings = requestValidatorBindings(artifacts["requestDescriptors.ts"]);
    const notificationBindings = identifierBindings(
      exportedObject(artifacts["notificationDescriptors.ts"], "notificationDescriptors"),
    );

    expect(javascriptExports).toEqual(
      new Set([
        "validateJSONRPCMessage",
        "validateServerNotification",
        "validateV2FixtureResponse",
      ]),
    );
    expect(runtimeExports).toEqual(javascriptExports);
    expect(declarationExports).toEqual(javascriptExports);
    expect(registryBindings).toEqual(
      new Map([
        ["JSONRPCMessage", "validateJSONRPCMessage"],
        ["ServerNotification", "validateServerNotification"],
        ["v2/FixtureResponse", "validateV2FixtureResponse"],
      ]),
    );
    expect(requestBindings).toEqual(new Map([["fixture/test", "validateV2FixtureResponse"]]));
    expect(notificationBindings).toEqual(
      new Map([["ServerNotification", "validateServerNotification"]]),
    );
    expect(notificationExportBinding(artifacts["notificationDescriptors.ts"])).toBe(
      "validateServerNotification",
    );
  });

  test("is byte-for-byte deterministic across complete generations", async () => {
    const first = await generate();
    const second = await generate();

    expect(second).toEqual(first);
  });
});
