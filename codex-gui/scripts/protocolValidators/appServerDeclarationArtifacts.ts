import ts from "typescript";

import { factory, generatedHeader, namedImport, print } from "./typescriptArtifactAst";
import type {
  NotificationDefinitionMetadata,
  RequestDefinitionMetadata,
} from "./typescriptArtifactTypes";

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

export function standaloneDeclarations(
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

export function publicIndex(): string {
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
