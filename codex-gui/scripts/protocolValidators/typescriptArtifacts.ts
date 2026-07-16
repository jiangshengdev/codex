import ts from "typescript";

export type RequestDefinitionMetadata = {
  method: string;
  paramsSchema: string;
  responseSchema: string;
};

export type TypeScriptFormatResult = {
  code: string;
  errors: readonly { message: string | null }[];
};

export type TypeScriptFormatter = (
  fileName: string,
  sourceText: string,
) => Promise<TypeScriptFormatResult>;

type TypeScriptArtifactOptions = {
  requestDefinitions: readonly RequestDefinitionMetadata[];
  validatorExports: ReadonlyMap<string, string>;
  formatTypeScript: TypeScriptFormatter;
};

const factory = ts.factory;
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function generatedSourceFile(statements: readonly ts.Statement[]): ts.SourceFile {
  return factory.updateSourceFile(
    ts.createSourceFile("generated.ts", "", ts.ScriptTarget.Latest, false, ts.ScriptKind.TS),
    statements,
  );
}

function print(statements: readonly ts.Statement[]): string {
  return printer.printFile(generatedSourceFile(statements));
}

function generatedHeader(): ts.NotEmittedStatement {
  return ts.addSyntheticLeadingComment(
    factory.createNotEmittedStatement(factory.createIdentifier("generated")),
    ts.SyntaxKind.SingleLineCommentTrivia,
    " GENERATED CODE! DO NOT MODIFY BY HAND!",
    true,
  );
}

function stringLiteralUnion(values: readonly string[]): ts.TypeNode {
  return factory.createUnionTypeNode(
    values.map((value) => factory.createLiteralTypeNode(factory.createStringLiteral(value))),
  );
}

function namedImport(
  moduleName: string,
  names: readonly string[],
  typeOnly = false,
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      typeOnly ? ts.SyntaxKind.TypeKeyword : undefined,
      undefined,
      factory.createNamedImports(
        names.map((name) =>
          factory.createImportSpecifier(false, undefined, factory.createIdentifier(name)),
        ),
      ),
    ),
    factory.createStringLiteral(moduleName),
  );
}

function validatorType(
  schemaId: string,
  requestDefinitions: readonly RequestDefinitionMetadata[],
): ts.TypeNode {
  if (schemaId === "JSONRPCMessage") return factory.createTypeReferenceNode("JSONRPCMessage");
  if (schemaId === "ServerNotification")
    return factory.createTypeReferenceNode("ServerNotification");

  const methods = requestDefinitions
    .filter(({ responseSchema }) => responseSchema === schemaId)
    .map(({ method }) =>
      factory.createTypeReferenceNode("RequestResponse", [
        factory.createLiteralTypeNode(factory.createStringLiteral(method)),
      ]),
    );
  if (methods.length === 0)
    throw new Error(`Missing response type for validator schema: ${schemaId}`);
  return methods.length === 1 ? methods[0] : factory.createUnionTypeNode(methods);
}

function standaloneDeclarations(
  validatorExports: ReadonlyMap<string, string>,
  requestDefinitions: readonly RequestDefinitionMetadata[],
): string {
  return print([
    generatedHeader(),
    namedImport("@codex-protocol/JSONRPCMessage", ["JSONRPCMessage"], true),
    namedImport("@codex-protocol/ServerNotification", ["ServerNotification"], true),
    namedImport(
      "../../features/guiHost/appServerProtocol",
      ["ProtocolValidator", "RequestResponse"],
      true,
    ),
    ...[...validatorExports.entries()].map(([schemaId, name]) =>
      factory.createVariableStatement(
        [
          factory.createModifier(ts.SyntaxKind.ExportKeyword),
          factory.createModifier(ts.SyntaxKind.DeclareKeyword),
        ],
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              factory.createIdentifier(name),
              undefined,
              factory.createTypeReferenceNode("ProtocolValidator", [
                validatorType(schemaId, requestDefinitions),
              ]),
              undefined,
            ),
          ],
          ts.NodeFlags.Const,
        ),
      ),
    ),
  ]);
}

function validatorRegistry(
  validatorExports: ReadonlyMap<string, string>,
  exportNames: readonly string[],
): string {
  const properties = [...validatorExports.entries()].map(([schemaId, exportName]) =>
    factory.createPropertyAssignment(
      factory.createStringLiteral(schemaId),
      factory.createIdentifier(exportName),
    ),
  );

  return print([
    generatedHeader(),
    namedImport("./standaloneValidators.js", exportNames),
    factory.createVariableStatement(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            "validatorRegistry",
            undefined,
            undefined,
            factory.createObjectLiteralExpression(properties, true),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ]);
}

function requestDescriptors(
  requestDefinitions: readonly RequestDefinitionMetadata[],
  validatorExports: ReadonlyMap<string, string>,
): string {
  const responseExports = requestDefinitions.map((definition) => {
    const exportName = validatorExports.get(definition.responseSchema);
    if (!exportName)
      throw new Error(`Missing response validator export: ${definition.responseSchema}`);
    return exportName;
  });
  const methods = requestDefinitions.map(({ method }) => method);
  const methodType = stringLiteralUnion(methods);
  const mappedType = factory.createMappedTypeNode(
    undefined,
    factory.createTypeParameterDeclaration(undefined, "M", methodType),
    undefined,
    undefined,
    factory.createTypeLiteralNode([
      factory.createPropertySignature(
        undefined,
        "method",
        undefined,
        factory.createTypeReferenceNode("M"),
      ),
      factory.createPropertySignature(
        undefined,
        "paramsSchema",
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
      factory.createPropertySignature(
        undefined,
        "responseSchema",
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
      factory.createPropertySignature(
        undefined,
        "validateResponse",
        undefined,
        factory.createTypeReferenceNode("ProtocolValidator", [
          factory.createTypeReferenceNode("RequestResponse", [
            factory.createTypeReferenceNode("M"),
          ]),
        ]),
      ),
    ]),
    undefined,
  );
  const properties = requestDefinitions.map((definition, index) => {
    const exportName = responseExports[index];
    if (!exportName)
      throw new Error(`Missing response validator export: ${definition.responseSchema}`);
    return factory.createPropertyAssignment(
      factory.createStringLiteral(definition.method),
      factory.createObjectLiteralExpression(
        [
          factory.createPropertyAssignment(
            "method",
            factory.createStringLiteral(definition.method),
          ),
          factory.createPropertyAssignment(
            "paramsSchema",
            factory.createStringLiteral(definition.paramsSchema),
          ),
          factory.createPropertyAssignment(
            "responseSchema",
            factory.createStringLiteral(definition.responseSchema),
          ),
          factory.createPropertyAssignment(
            "validateResponse",
            factory.createIdentifier(exportName),
          ),
        ],
        true,
      ),
    );
  });

  return print([
    generatedHeader(),
    namedImport(
      "../../features/guiHost/appServerProtocol",
      ["ProtocolValidator", "RequestResponse"],
      true,
    ),
    namedImport("./standaloneValidators.js", responseExports),
    factory.createVariableStatement(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            "requestDescriptors",
            undefined,
            undefined,
            factory.createSatisfiesExpression(
              factory.createObjectLiteralExpression(properties, true),
              mappedType,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ]);
}

function notificationDescriptors(serverNotificationExport: string): string {
  return print([
    generatedHeader(),
    namedImport("./standaloneValidators.js", [serverNotificationExport]),
    factory.createExportDeclaration(
      undefined,
      false,
      factory.createNamedExports([
        factory.createExportSpecifier(
          false,
          undefined,
          factory.createIdentifier(serverNotificationExport),
        ),
      ]),
    ),
    factory.createVariableStatement(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            "notificationDescriptors",
            undefined,
            undefined,
            factory.createObjectLiteralExpression(
              [
                factory.createPropertyAssignment(
                  "ServerNotification",
                  factory.createIdentifier(serverNotificationExport),
                ),
              ],
              true,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ]);
}

function publicIndex(): string {
  return print([
    generatedHeader(),
    ...["./validatorRegistry", "./requestDescriptors", "./notificationDescriptors"].map(
      (moduleName) =>
        factory.createExportDeclaration(
          undefined,
          false,
          undefined,
          factory.createStringLiteral(moduleName),
        ),
    ),
  ]);
}

async function formatArtifact(
  fileName: string,
  sourceText: string,
  formatTypeScript: TypeScriptFormatter,
): Promise<string> {
  const result = await formatTypeScript(fileName, sourceText);
  if (result.errors.length > 0) {
    const messages = result.errors
      .map(({ message }) => message ?? "unknown formatting error")
      .join("; ");
    throw new Error(`oxfmt failed for ${fileName}: ${messages}`);
  }
  return result.code;
}

export async function generateTypeScriptArtifacts({
  requestDefinitions,
  validatorExports,
  formatTypeScript,
}: TypeScriptArtifactOptions): Promise<Record<string, string>> {
  const exportNames = [...validatorExports.values()].sort();
  const serverNotificationExport = validatorExports.get("ServerNotification");
  if (!serverNotificationExport) throw new Error("Missing ServerNotification validator export");

  const sources: Record<string, string> = {
    "standaloneValidators.d.ts": standaloneDeclarations(validatorExports, requestDefinitions),
    "validatorRegistry.ts": validatorRegistry(validatorExports, exportNames),
    "requestDescriptors.ts": requestDescriptors(requestDefinitions, validatorExports),
    "notificationDescriptors.ts": notificationDescriptors(serverNotificationExport),
    "index.ts": publicIndex(),
  };
  const artifacts: Record<string, string> = {};
  for (const fileName of Object.keys(sources).sort()) {
    const sourceText = sources[fileName];
    artifacts[fileName] = await formatArtifact(fileName, sourceText, formatTypeScript);
  }
  return artifacts;
}
