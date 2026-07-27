import ts from "typescript";

export const factory = ts.factory;

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function generatedSourceFile(statements: readonly ts.Statement[]): ts.SourceFile {
  return factory.updateSourceFile(
    ts.createSourceFile("generated.ts", "", ts.ScriptTarget.Latest, false, ts.ScriptKind.TS),
    statements,
  );
}

export function print(statements: readonly ts.Statement[]): string {
  return printer.printFile(generatedSourceFile(statements));
}

export function generatedHeader(): ts.NotEmittedStatement {
  return ts.addSyntheticLeadingComment(
    factory.createNotEmittedStatement(factory.createIdentifier("generated")),
    ts.SyntaxKind.SingleLineCommentTrivia,
    " GENERATED CODE! DO NOT MODIFY BY HAND!",
    true,
  );
}

export function stringLiteralUnion(values: readonly string[]): ts.TypeNode {
  return factory.createUnionTypeNode(
    values.map((value) => factory.createLiteralTypeNode(factory.createStringLiteral(value))),
  );
}

export function namedImport(
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
