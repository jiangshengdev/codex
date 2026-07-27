import ts from "typescript";

import {
  factory,
  generatedHeader,
  namedImport,
  print,
  stringLiteralUnion,
} from "./typescriptArtifactAst";
import type { RequestDefinitionMetadata } from "./typescriptArtifactTypes";

export function requestDescriptors(
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
