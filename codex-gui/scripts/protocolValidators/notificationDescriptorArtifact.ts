import ts from "typescript";

import {
  factory,
  generatedHeader,
  namedImport,
  print,
  stringLiteralUnion,
} from "./typescriptArtifactAst";
import type { NotificationDefinitionMetadata } from "./typescriptArtifactTypes";

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

export function notificationDescriptors(
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
