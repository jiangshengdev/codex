import ts from "typescript";

export type RequestDefinitionMetadata = {
  method: string;
  paramsSchema: string;
  responseSchema: string;
};

export type NotificationDefinitionMetadata = {
  method: string;
  paramsSchema: string;
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
  notificationDefinitions: readonly NotificationDefinitionMetadata[];
  selectedNotificationDefinitions: readonly NotificationDefinitionMetadata[];
  envelopeValidatorExports: ReadonlyMap<string, string>;
  payloadValidatorExports: ReadonlyMap<string, string>;
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
  notificationDefinitions: readonly NotificationDefinitionMetadata[],
): ts.TypeNode {
  if (schemaId === "JSONRPCMessage") return factory.createTypeReferenceNode("JSONRPCMessage");

  const responseTypes = requestDefinitions
    .filter(({ responseSchema }) => responseSchema === schemaId)
    .map(({ method }) =>
      factory.createTypeReferenceNode("RequestResponse", [
        factory.createLiteralTypeNode(factory.createStringLiteral(method)),
      ]),
    );
  const notificationTypes = notificationDefinitions
    .filter(({ paramsSchema }) => paramsSchema === schemaId)
    .map(({ method }) =>
      factory.createIndexedAccessTypeNode(
        factory.createTypeReferenceNode("Extract", [
          factory.createTypeReferenceNode("ServerNotification"),
          factory.createTypeLiteralNode([
            factory.createPropertySignature(
              undefined,
              "method",
              undefined,
              factory.createLiteralTypeNode(factory.createStringLiteral(method)),
            ),
          ]),
        ]),
        factory.createLiteralTypeNode(factory.createStringLiteral("params")),
      ),
    );
  const types = [...responseTypes, ...notificationTypes];
  if (types.length === 0) throw new Error(`Missing TypeScript type for validator: ${schemaId}`);
  return types.length === 1 ? types[0] : factory.createUnionTypeNode(types);
}

function standaloneDeclarations(
  validatorExports: ReadonlyMap<string, string>,
  requestDefinitions: readonly RequestDefinitionMetadata[],
  notificationDefinitions: readonly NotificationDefinitionMetadata[],
): string {
  const needsJsonRpcMessage = validatorExports.has("JSONRPCMessage");
  const needsRequestResponse = requestDefinitions.some(({ responseSchema }) =>
    validatorExports.has(responseSchema),
  );
  const needsServerNotification = notificationDefinitions.some(({ paramsSchema }) =>
    validatorExports.has(paramsSchema),
  );
  return print([
    generatedHeader(),
    ...(needsJsonRpcMessage
      ? [namedImport("@codex-protocol/JSONRPCMessage", ["JSONRPCMessage"], true)]
      : []),
    ...(needsServerNotification
      ? [namedImport("@codex-protocol/ServerNotification", ["ServerNotification"], true)]
      : []),
    namedImport(
      "../../features/guiHost/appServerProtocol",
      ["ProtocolValidator", ...(needsRequestResponse ? ["RequestResponse"] : [])],
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
                validatorType(schemaId, requestDefinitions, notificationDefinitions),
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
    namedImport("./appServerPayloadValidators.js", responseExports),
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

function selectedServerNotificationType(methods: readonly string[]): ts.TypeNode {
  return factory.createTypeReferenceNode("Extract", [
    factory.createTypeReferenceNode("ServerNotification"),
    factory.createTypeLiteralNode([
      factory.createPropertySignature(undefined, "method", undefined, stringLiteralUnion(methods)),
    ]),
  ]);
}

function classificationType(): ts.TypeNode {
  return factory.createUnionTypeNode([
    factory.createTypeLiteralNode([
      factory.createPropertySignature(
        undefined,
        "type",
        undefined,
        factory.createLiteralTypeNode(factory.createStringLiteral("selected")),
      ),
      factory.createPropertySignature(
        undefined,
        "notification",
        undefined,
        factory.createTypeReferenceNode("SelectedServerNotification"),
      ),
    ]),
    factory.createTypeLiteralNode([
      factory.createPropertySignature(
        undefined,
        "type",
        undefined,
        factory.createLiteralTypeNode(factory.createStringLiteral("selectedInvalid")),
      ),
      factory.createPropertySignature(
        undefined,
        "method",
        undefined,
        factory.createIndexedAccessTypeNode(
          factory.createTypeReferenceNode("SelectedServerNotification"),
          factory.createLiteralTypeNode(factory.createStringLiteral("method")),
        ),
      ),
    ]),
    ...["knownUnconsumed", "unknown"].map((type) =>
      factory.createTypeLiteralNode([
        factory.createPropertySignature(
          undefined,
          "type",
          undefined,
          factory.createLiteralTypeNode(factory.createStringLiteral(type)),
        ),
      ]),
    ),
  ]);
}

function selectedNotificationCase(
  definition: NotificationDefinitionMetadata,
  validatorExport: string,
): ts.CaseClause {
  const method = factory.createPropertyAccessExpression(
    factory.createIdentifier("notification"),
    "method",
  );
  return factory.createCaseClause(factory.createStringLiteral(definition.method), [
    factory.createIfStatement(
      factory.createPrefixUnaryExpression(
        ts.SyntaxKind.ExclamationToken,
        factory.createCallExpression(factory.createIdentifier(validatorExport), undefined, [
          factory.createPropertyAccessExpression(
            factory.createIdentifier("notification"),
            "params",
          ),
        ]),
      ),
      factory.createBlock(
        [
          factory.createReturnStatement(
            factory.createObjectLiteralExpression([
              factory.createPropertyAssignment(
                "type",
                factory.createStringLiteral("selectedInvalid"),
              ),
              factory.createPropertyAssignment("method", method),
            ]),
          ),
        ],
        true,
      ),
    ),
    factory.createReturnStatement(
      factory.createObjectLiteralExpression(
        [
          factory.createPropertyAssignment("type", factory.createStringLiteral("selected")),
          factory.createPropertyAssignment(
            "notification",
            factory.createObjectLiteralExpression(
              [
                factory.createPropertyAssignment("method", method),
                factory.createPropertyAssignment(
                  "params",
                  factory.createPropertyAccessExpression(
                    factory.createIdentifier("notification"),
                    "params",
                  ),
                ),
              ],
              true,
            ),
          ),
        ],
        true,
      ),
    ),
  ]);
}

function knownNotificationMethodFunction(
  notificationDefinitions: readonly NotificationDefinitionMetadata[],
): ts.FunctionDeclaration {
  const knownCases = notificationDefinitions.map(({ method }) =>
    factory.createCaseClause(factory.createStringLiteral(method), [
      factory.createReturnStatement(factory.createTrue()),
    ]),
  );
  return factory.createFunctionDeclaration(
    undefined,
    undefined,
    "isKnownServerNotificationMethod",
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        "method",
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
    ],
    factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword),
    factory.createBlock(
      [
        factory.createSwitchStatement(
          factory.createIdentifier("method"),
          factory.createCaseBlock([
            ...knownCases,
            factory.createDefaultClause([factory.createReturnStatement(factory.createFalse())]),
          ]),
        ),
      ],
      true,
    ),
  );
}

function notificationDescriptors(
  notificationDefinitions: readonly NotificationDefinitionMetadata[],
  selectedDefinitions: readonly NotificationDefinitionMetadata[],
  validatorExports: ReadonlyMap<string, string>,
): string {
  const selectedValidators = [
    ...new Set(
      selectedDefinitions.map(({ paramsSchema }) => {
        const validatorExport = validatorExports.get(paramsSchema);
        if (!validatorExport) {
          throw new Error(`Missing notification validator export: ${paramsSchema}`);
        }
        return validatorExport;
      }),
    ),
  ];
  const selectedMethods = selectedDefinitions.map(({ method }) => method);
  const selectedCases = selectedDefinitions.map((definition) => {
    const validatorExport = validatorExports.get(definition.paramsSchema);
    if (!validatorExport) {
      throw new Error(`Missing notification validator export: ${definition.paramsSchema}`);
    }
    return selectedNotificationCase(definition, validatorExport);
  });

  return print([
    generatedHeader(),
    namedImport("@codex-protocol/JSONRPCNotification", ["JSONRPCNotification"], true),
    namedImport("@codex-protocol/ServerNotification", ["ServerNotification"], true),
    namedImport("./appServerPayloadValidators.js", selectedValidators),
    factory.createTypeAliasDeclaration(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      "SelectedServerNotification",
      undefined,
      selectedServerNotificationType(selectedMethods),
    ),
    factory.createTypeAliasDeclaration(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      "ServerNotificationClassification",
      undefined,
      classificationType(),
    ),
    knownNotificationMethodFunction(notificationDefinitions),
    factory.createFunctionDeclaration(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      "classifyServerNotification",
      undefined,
      [
        factory.createParameterDeclaration(
          undefined,
          undefined,
          "notification",
          undefined,
          factory.createTypeReferenceNode("JSONRPCNotification"),
        ),
      ],
      factory.createTypeReferenceNode("ServerNotificationClassification"),
      factory.createBlock(
        [
          factory.createSwitchStatement(
            factory.createPropertyAccessExpression(
              factory.createIdentifier("notification"),
              "method",
            ),
            factory.createCaseBlock([
              ...selectedCases,
              factory.createDefaultClause([
                factory.createReturnStatement(
                  factory.createConditionalExpression(
                    factory.createCallExpression(
                      factory.createIdentifier("isKnownServerNotificationMethod"),
                      undefined,
                      [
                        factory.createPropertyAccessExpression(
                          factory.createIdentifier("notification"),
                          "method",
                        ),
                      ],
                    ),
                    factory.createToken(ts.SyntaxKind.QuestionToken),
                    factory.createObjectLiteralExpression([
                      factory.createPropertyAssignment(
                        "type",
                        factory.createStringLiteral("knownUnconsumed"),
                      ),
                    ]),
                    factory.createToken(ts.SyntaxKind.ColonToken),
                    factory.createObjectLiteralExpression([
                      factory.createPropertyAssignment(
                        "type",
                        factory.createStringLiteral("unknown"),
                      ),
                    ]),
                  ),
                ),
              ]),
            ]),
          ),
        ],
        true,
      ),
    ),
  ]);
}

function publicIndex(): string {
  return print([
    generatedHeader(),
    ...["./requestDescriptors", "./notificationDescriptors"].map((moduleName) =>
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
  notificationDefinitions,
  selectedNotificationDefinitions,
  envelopeValidatorExports,
  payloadValidatorExports,
  formatTypeScript,
}: TypeScriptArtifactOptions): Promise<Record<string, string>> {
  const sources: Record<string, string> = {
    "jsonRpcEnvelopeValidators.d.ts": standaloneDeclarations(envelopeValidatorExports, [], []),
    "appServerPayloadValidators.d.ts": standaloneDeclarations(
      payloadValidatorExports,
      requestDefinitions,
      selectedNotificationDefinitions,
    ),
    "requestDescriptors.ts": requestDescriptors(requestDefinitions, payloadValidatorExports),
    "notificationDescriptors.ts": notificationDescriptors(
      notificationDefinitions,
      selectedNotificationDefinitions,
      payloadValidatorExports,
    ),
    "index.ts": publicIndex(),
  };
  const artifacts: Record<string, string> = {};
  for (const fileName of Object.keys(sources).sort()) {
    const sourceText = sources[fileName];
    artifacts[fileName] = await formatArtifact(fileName, sourceText, formatTypeScript);
  }
  return artifacts;
}

function guiHostStandaloneDeclarations(validatorExports: ReadonlyMap<string, string>): string {
  return print([
    generatedHeader(),
    namedImport(
      "@codex-gui-host-contract",
      ["GuiAuthenticateParams", "GuiAuthenticateResult"],
      true,
    ),
    namedImport("../../features/guiHost/appServerProtocol", ["ProtocolValidator"], true),
    ...[...validatorExports.entries()].map(([schemaId, exportName]) =>
      factory.createVariableStatement(
        [
          factory.createModifier(ts.SyntaxKind.ExportKeyword),
          factory.createModifier(ts.SyntaxKind.DeclareKeyword),
        ],
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              exportName,
              undefined,
              factory.createTypeReferenceNode("ProtocolValidator", [
                factory.createTypeReferenceNode(schemaId),
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

function guiHostPublicIndex(exportNames: readonly string[]): string {
  return print([
    generatedHeader(),
    factory.createExportDeclaration(
      undefined,
      false,
      factory.createNamedExports(
        exportNames.map((exportName) =>
          factory.createExportSpecifier(false, undefined, factory.createIdentifier(exportName)),
        ),
      ),
      factory.createStringLiteral("./standaloneValidators.js"),
    ),
    factory.createExportDeclaration(
      undefined,
      false,
      undefined,
      factory.createStringLiteral("./validatorRegistry"),
    ),
  ]);
}

export async function generateGuiHostContractTypeScriptArtifacts({
  validatorExports,
  formatTypeScript,
}: {
  validatorExports: ReadonlyMap<string, string>;
  formatTypeScript: TypeScriptFormatter;
}): Promise<Record<string, string>> {
  const exportNames = [...validatorExports.values()].sort();
  const sources: Record<string, string> = {
    "standaloneValidators.d.ts": guiHostStandaloneDeclarations(validatorExports),
    "validatorRegistry.ts": validatorRegistry(validatorExports, exportNames),
    "index.ts": guiHostPublicIndex(exportNames),
  };
  const artifacts: Record<string, string> = {};
  for (const fileName of Object.keys(sources).sort()) {
    artifacts[fileName] = await formatArtifact(fileName, sources[fileName], formatTypeScript);
  }
  return artifacts;
}
