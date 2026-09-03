import ts from "typescript";

import { generateProtocolArtifacts } from "./core";

const FIXTURE_REQUEST_METHODS = ["fixture/test"] as const;
const FIXTURE_NOTIFICATION_METHODS = ["fixture/selected"] as const;

export type JsonObject = Record<string, unknown>;

export function requestDefinitions(): JsonObject[] {
  return [
    {
      method: "fixture/test",
      paramsSchema: "v2/FixtureParams",
      responseSchema: "v2/FixtureResponse",
    },
  ];
}

export function notificationDefinitions(): JsonObject[] {
  return [
    { method: "fixture/selected", paramsSchema: "v2/SelectedNotification" },
    { method: "fixture/unselected", paramsSchema: "v2/UnselectedNotification" },
  ];
}

export function schemaBundle(): JsonObject {
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
        TurnError: {
          type: "object",
          properties: {
            message: { type: "string" },
            codexErrorInfo: {
              anyOf: [{ enum: ["other"], type: "string" }, { type: "null" }],
            },
            additionalDetails: { type: ["string", "null"] },
          },
          required: ["message"],
        },
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

export async function generate(
  overrides: {
    schemaBundle?: JsonObject;
    requestDefinitions?: JsonObject[];
    notificationDefinitions?: JsonObject[];
    selectedRequestMethods?: readonly string[];
    selectedNotificationMethods?: readonly string[];
    selectedAuxiliarySchemaIds?: readonly string[];
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
    selectedAuxiliarySchemaIds: overrides.selectedAuxiliarySchemaIds ?? [],
    dependencies: overrides.dependencies,
  });
}

export function nestedDefinitions(bundle: JsonObject): JsonObject {
  return (bundle.definitions as JsonObject).v2 as JsonObject;
}

export function parseDiagnostics(fileName: string, sourceText: string): readonly ts.Diagnostic[] {
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

export function exportedNames(fileName: string, sourceText: string): Set<string> {
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

export function exportedObject(
  sourceText: string,
  variableName: string,
): ts.ObjectLiteralExpression {
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

export function identifierBindings(object: ts.ObjectLiteralExpression): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.initializer)) {
      throw new Error(`Expected generated identifier binding: ${property.getText()}`);
    }
    bindings.set(propertyNameText(property.name), property.initializer.text);
  }
  return bindings;
}

export function requestValidatorBindings(sourceText: string): Map<string, string> {
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

export function importedNames(sourceText: string, moduleName: string): Set<string> {
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

export async function importJavaScript(sourceText: string): Promise<Record<string, unknown>> {
  return import(
    `data:text/javascript;base64,${Buffer.from(sourceText).toString("base64")}`
  ) as Promise<Record<string, unknown>>;
}

type RuntimeValidator = ((input: unknown) => boolean) & {
  errors?: readonly { message?: string }[] | null;
};

export function isRuntimeValidator(value: unknown): value is RuntimeValidator {
  return typeof value === "function";
}
