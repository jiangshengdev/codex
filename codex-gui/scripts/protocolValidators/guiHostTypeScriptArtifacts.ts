import ts from "typescript";

import { factory, generatedHeader, namedImport, print } from "./typescriptArtifactAst";

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

export function guiHostTypeScriptSources(
  validatorExports: ReadonlyMap<string, string>,
): Record<string, string> {
  const exportNames = [...validatorExports.values()].sort();
  return {
    "standaloneValidators.d.ts": guiHostStandaloneDeclarations(validatorExports),
    "validatorRegistry.ts": validatorRegistry(validatorExports, exportNames),
    "index.ts": guiHostPublicIndex(exportNames),
  };
}
