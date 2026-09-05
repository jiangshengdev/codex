import path from "node:path";
import ts from "typescript";
import type { AnalyzeProjectOptions, BoundaryAnalysis, BoundaryDiagnosticCode } from "./contracts";

const normalize = (value: string) => value.split(path.sep).join("/");
const featureOf = (file: string) => /^src\/features\/([^/]+)\//.exec(file)?.[1];
const conventionalTest = (file: string) =>
  /(?:^|\/)__tests__\//.test(file) || /\.(?:test|spec)\.[cm]?tsx?$/.test(file);

/** The compiler resolves module identities and aliases; policy owns access decisions. */
export function analyzeProject({ projectRoot, policy }: AnalyzeProjectOptions): BoundaryAnalysis {
  const root = path.resolve(projectRoot);
  const relative = (file: string) => normalize(path.relative(root, file));
  const result: BoundaryAnalysis = { diagnostics: [], files: [], accesses: [] };
  const report = (node: ts.Node | undefined, code: BoundaryDiagnosticCode, message: string) => {
    const source = node?.getSourceFile();
    const position =
      source && node ? source.getLineAndCharacterOfPosition(node.getStart(source)) : undefined;
    result.diagnostics.push({
      file: source ? relative(source.fileName) : "scripts/featureBoundaries/policy.ts",
      line: (position?.line ?? 0) + 1,
      column: (position?.character ?? 0) + 1,
      code,
      message,
    });
  };
  const configPath =
    ts.findConfigFile(root, (file) => ts.sys.fileExists(file), "tsconfig.app.json") ??
    ts.findConfigFile(root, (file) => ts.sys.fileExists(file));
  let options: ts.CompilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
  };
  if (configPath) {
    const config = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
    if (config.error)
      report(
        undefined,
        "invalid-policy",
        ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
      );
    else {
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
      options = { ...options, ...parsed.options };
      for (const error of parsed.errors) {
        if (error.code !== 18003)
          report(
            undefined,
            "invalid-policy",
            ts.flattenDiagnosticMessageText(error.messageText, "\n"),
          );
      }
    }
  }
  const inputs = ts.sys.readDirectory(
    path.join(root, "src"),
    [".ts", ".tsx", ".mts", ".cts"],
    undefined,
    ["**/*"],
  );
  result.files = inputs.map(relative).sort();
  const program = ts.createProgram(inputs, options);
  const checker = program.getTypeChecker();
  const testFile = (file: string) =>
    conventionalTest(file) || policy.testSupportFiles.includes(file);
  const exportCache = new Map<string, readonly ts.Symbol[]>();
  const moduleExports = (file: string) => {
    const cached = exportCache.get(file);
    if (cached) return cached;
    const source = program.getSourceFile(path.resolve(root, file));
    const symbol = source && checker.getSymbolAtLocation(source);
    const exports = symbol ? checker.getExportsOfModule(symbol) : [];
    exportCache.set(file, exports);
    return exports;
  };
  const exactPath = (file: string) =>
    file.startsWith("src/") &&
    !/[\\*?]/.test(file) &&
    normalize(path.posix.normalize(file)) === file &&
    !file.includes("/../");
  const entries = new Map(policy.publicModules.map((entry) => [entry.path, entry]));
  const invalid = (message: string) => {
    report(undefined, "invalid-policy", message);
  };
  if (
    new Set(policy.features).size !== policy.features.length ||
    policy.features.some((feature) => !/^[\w-]+$/.test(feature))
  )
    invalid("Feature names must be unique exact directory names.");
  if (entries.size !== policy.publicModules.length) invalid("Public module paths must be unique.");
  for (const entry of policy.publicModules) {
    if (!exactPath(entry.path) || !result.files.includes(entry.path))
      invalid(`Public module does not name an existing exact source file: ${entry.path}`);
    if (!policy.features.includes(entry.owner) || featureOf(entry.path) !== entry.owner)
      invalid(`Public module owner does not match its feature: ${entry.path}`);
    if (!entry.purpose.trim()) invalid(`Public module requires a purpose: ${entry.path}`);
    if (!["testing", "production"].includes(entry.audience))
      invalid(`Invalid audience: ${entry.path}`);
    if (testFile(entry.path) && entry.audience !== "testing")
      invalid(`Test module cannot publish production capabilities: ${entry.path}`);
    const exports = moduleExports(entry.path);
    if (new Set(entry.exports).size !== entry.exports.length)
      invalid(`Duplicate public exports: ${entry.path}`);
    for (const name of entry.exports)
      if (name === "*" || !exports.some((symbol) => symbol.name === name))
        invalid(`Public export does not exist or is a wildcard: ${entry.path}#${name}`);
  }
  for (const file of policy.testSupportFiles)
    if (!exactPath(file) || !result.files.includes(file) || featureOf(file))
      invalid(`Test infrastructure must name an existing exact outer source file: ${file}`);
  for (const direction of policy.allowedDirections) {
    const consumer = direction.consumer;
    if (
      !policy.features.includes(direction.target) ||
      !["production", "testing"].includes(direction.audience)
    )
      invalid(`Invalid direction target or audience: ${direction.target}`);
    if ("feature" in consumer) {
      if (!policy.features.includes(consumer.feature))
        invalid(`Unknown direction consumer: ${consumer.feature}`);
    } else if (
      !exactPath(consumer.file) ||
      !result.files.includes(consumer.file) ||
      featureOf(consumer.file)
    )
      invalid(`Direction consumer must be an exact outer file: ${consumer.file}`);
  }
  for (const issue of policy.knownDirectionIssues)
    if (
      !policy.features.includes(issue.from) ||
      !policy.features.includes(issue.to) ||
      !issue.issue.trim() ||
      !issue.description.trim()
    )
      invalid(
        "Known direction issues must identify registered features and describe their tracked ownership work.",
      );
  for (const file of result.files) {
    const feature = featureOf(file);
    if (feature && !policy.features.includes(feature)) {
      const source = program.getSourceFile(path.resolve(root, file));
      report(source, "unknown-feature", `Feature ${feature} is not registered.`);
    }
  }

  const resolve = (specifier: string, source: ts.SourceFile, node: ts.Node) => {
    const resolved = ts.resolveModuleName(
      specifier,
      source.fileName,
      options,
      ts.sys,
    ).resolvedModule;
    if (resolved) return relative(resolved.resolvedFileName);
    const local =
      specifier.startsWith(".") ||
      specifier.startsWith("/") ||
      Object.keys(options.paths ?? {}).some((alias) =>
        specifier.startsWith(alias.split("*")[0] ?? alias),
      );
    if (local && !/\.(?:css|po|svg|png|jpg|webp)(?:\?.*)?$/.test(specifier))
      report(node, "unresolved-module", `Cannot resolve local module ${specifier}.`);
    return undefined;
  };
  const unalias = (symbol: ts.Symbol) =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const check = (
    node: ts.Node,
    target: string,
    names: readonly string[],
    runtimeOnly = false,
    seen = new Set<string>(),
  ) => {
    const source = relative(node.getSourceFile().fileName);
    const key = `${target}:${names.join(",")}:${String(runtimeOnly)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const owner = featureOf(target);
    const sourceOwner = featureOf(source);
    const publicModule = entries.get(target);
    if (!testFile(source) && (testFile(target) || publicModule?.audience === "testing"))
      report(
        node,
        "production-to-testing",
        `Production code cannot consume testing capability ${target}.`,
      );
    const exports = moduleExports(target);
    const selected = names.includes("*")
      ? exports
          .filter((symbol) => !runtimeOnly || (unalias(symbol).flags & ts.SymbolFlags.Value) !== 0)
          .map((symbol) => symbol.name)
      : names;
    if (owner && owner !== sourceOwner) {
      if (!publicModule)
        report(
          node,
          "private-module",
          `${target} is internal to ${owner}; use a registered public module.`,
        );
      else
        for (const name of selected)
          if (!publicModule.exports.includes(name))
            report(
              node,
              "private-export",
              `${target}#${name} is not public; use a registered export.`,
            );
      if (
        !policy.allowedDirections.some(
          (direction) =>
            direction.target === owner &&
            (direction.audience === "production" || testFile(source)) &&
            ("feature" in direction.consumer
              ? direction.consumer.feature === sourceOwner
              : direction.consumer.file === source),
        )
      )
        report(
          node,
          "forbidden-direction",
          `${sourceOwner ?? source} is not allowed to consume ${owner}.`,
        );
    }
    // Resolve aliases to their declarations even when the immediate target is an outer barrel.
    for (const name of selected) {
      const exported = exports.find((symbol) => symbol.name === name);
      if (!exported) continue;
      const original = unalias(exported);
      for (const declaration of original.declarations ?? []) {
        const origin = relative(declaration.getSourceFile().fileName);
        if (origin !== target && origin.startsWith("src/"))
          check(
            node,
            origin,
            ts.isSourceFile(declaration) ? ["*"] : [original.name],
            runtimeOnly,
            seen,
          );
      }
    }
  };
  const access = (
    node: ts.Node,
    specifier: string,
    names: readonly string[],
    runtimeOnly = false,
  ) => {
    const target = resolve(specifier, node.getSourceFile(), node);
    if (!target) return;
    const position = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
    result.accesses.push({
      file: relative(node.getSourceFile().fileName),
      line: position.line + 1,
      column: position.character + 1,
      target,
      names,
    });
    check(node, target, names, runtimeOnly);
  };
  const unwrap = (node: ts.Node): ts.Node =>
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
      ? unwrap(node.expression)
      : node;
  const references = (binding: ts.Identifier) => {
    const symbol = checker.getSymbolAtLocation(binding);
    const names = new Set<string>();
    const visit = (node: ts.Node) => {
      if (
        node !== binding &&
        ts.isIdentifier(node) &&
        symbol &&
        checker.getSymbolAtLocation(node) === symbol
      ) {
        const parent = node.parent;
        if (
          (ts.isPropertyAccessExpression(parent) || ts.isQualifiedName(parent)) &&
          (ts.isPropertyAccessExpression(parent)
            ? parent.expression === node
            : parent.left === node)
        )
          names.add(ts.isPropertyAccessExpression(parent) ? parent.name.text : parent.right.text);
        else if (
          ts.isElementAccessExpression(parent) &&
          parent.expression === node &&
          ts.isStringLiteralLike(parent.argumentExpression)
        )
          names.add(parent.argumentExpression.text);
        else names.add("*");
      }
      ts.forEachChild(node, visit);
    };
    visit(binding.getSourceFile());
    return names.has("*") ? ["*"] : [...names];
  };
  const consumed = (expression: ts.Node): string[] => {
    let value = expression;
    while (unwrap(value.parent) === unwrap(expression)) value = value.parent;
    const parent = value.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value)
      return [parent.name.text];
    if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === value &&
      ts.isStringLiteralLike(parent.argumentExpression)
    )
      return [parent.argumentExpression.text];
    if (ts.isVariableDeclaration(parent) && parent.initializer === value) {
      if (ts.isIdentifier(parent.name)) return references(parent.name);
      if (ts.isObjectBindingPattern(parent.name))
        return parent.name.elements.flatMap((element) =>
          element.dotDotDotToken
            ? ["*"]
            : [
                element.propertyName?.getText().replace(/^['"]|['"]$/g, "") ??
                  (ts.isIdentifier(element.name) ? element.name.text : "*"),
              ],
        );
    }
    return ["*"];
  };
  const literal = (node: ts.Node | undefined): string | undefined =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined;
  const mockMethod = (expression: ts.Expression) => {
    if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression))
      return undefined;
    const receiver = expression.expression;
    const declaration = checker.getSymbolAtLocation(receiver)?.declarations?.[0];
    const importedVitest =
      declaration &&
      ts.isImportSpecifier(declaration) &&
      ["vi", "vitest"].includes((declaration.propertyName ?? declaration.name).text) &&
      ts.isImportDeclaration(declaration.parent.parent.parent) &&
      literal(declaration.parent.parent.parent.moduleSpecifier) === "vitest";
    if (!["vi", "vitest", "jest"].includes(receiver.text) && !importedVitest) return undefined;
    return [
      "mock",
      "doMock",
      "importActual",
      "importMock",
      "requireActual",
      "requireMock",
    ].includes(expression.name.text)
      ? expression.name.text
      : undefined;
  };
  const dynamic = (
    node: ts.Node,
    argument: ts.Node | undefined,
    names: readonly string[],
    runtimeOnly: boolean,
  ) => {
    const text = literal(argument);
    if (text !== undefined) access(node, text, names, runtimeOnly);
    else {
      // Resource catalogs are not executable feature modules. This is deliberately narrow.
      const locale =
        argument &&
        ts.isTemplateExpression(argument) &&
        argument.head.text === "./locales/" &&
        argument.templateSpans.length === 1 &&
        argument.templateSpans[0].literal.text === ".po";
      if (!locale)
        report(
          node,
          "indeterminate-access",
          "Module target cannot be determined statically; use a literal module path.",
        );
    }
  };
  const globAccess = (node: ts.CallExpression) => {
    const expression = node.expression;
    if (
      !ts.isPropertyAccessExpression(expression) ||
      expression.name.text !== "glob" ||
      !ts.isMetaProperty(expression.expression) ||
      expression.expression.keywordToken !== ts.SyntaxKind.ImportKeyword ||
      expression.expression.name.text !== "meta"
    )
      return false;
    const patterns = node.arguments.at(0);
    const targets =
      patterns && ts.isArrayLiteralExpression(patterns) ? patterns.elements : [patterns];
    let names = ["*"];
    const globOptions = node.arguments.at(1);
    if (globOptions) {
      if (!ts.isObjectLiteralExpression(globOptions)) {
        report(
          node,
          "indeterminate-access",
          "Glob options must be statically known to determine imported members.",
        );
        return true;
      }
      for (const property of globOptions.properties) {
        if (
          !ts.isPropertyAssignment(property) ||
          (!ts.isIdentifier(property.name) && !ts.isStringLiteralLike(property.name))
        ) {
          report(
            node,
            "indeterminate-access",
            "Glob options cannot contain opaque or computed properties.",
          );
          return true;
        }
        if (property.name.text === "import") {
          const name = literal(property.initializer);
          if (name === undefined) {
            report(node, "indeterminate-access", "Glob imported member must be a literal name.");
            return true;
          }
          names = [name];
        }
      }
    }
    for (const target of targets) {
      const pattern = literal(target);
      if (pattern === undefined || /[*?{}[\]!()]/.test(pattern)) {
        report(
          node,
          "indeterminate-access",
          "Glob target must be an exact literal module path; wildcard coverage is not statically proven.",
        );
      } else {
        // Vite absolute patterns are relative to the project root, unlike TS imports.
        const specifier = pattern.startsWith("/") ? path.resolve(root, `.${pattern}`) : pattern;
        access(node, specifier, names, true);
      }
    }
    return true;
  };
  for (const input of inputs) {
    const source = program.getSourceFile(input);
    if (!source) continue;
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const clause = node.importClause;
        const names: string[] = [];
        if (clause?.name) names.push("default");
        if (clause?.namedBindings) {
          if (ts.isNamedImports(clause.namedBindings))
            names.push(
              ...clause.namedBindings.elements.map(
                (element) => (element.propertyName ?? element.name).text,
              ),
            );
          else names.push(...references(clause.namedBindings.name));
        }
        access(
          node,
          node.moduleSpecifier.text,
          names,
          clause?.phaseModifier !== ts.SyntaxKind.TypeKeyword,
        );
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        const names =
          node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements.map(
                (element) => (element.propertyName ?? element.name).text,
              )
            : ["*"];
        access(node, node.moduleSpecifier.text, names, false);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        dynamic(node, node.moduleReference.expression, references(node.name), !node.isTypeOnly);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        let qualifier = node.qualifier;
        while (qualifier && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
        dynamic(node, node.argument.literal, qualifier ? [qualifier.text] : ["*"], false);
      } else if (ts.isCallExpression(node)) {
        if (globAccess(node)) {
          ts.forEachChild(node, visit);
          return;
        }
        const method = mockMethod(node.expression);
        const parent = node.parent;
        const mockTarget =
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          ts.isCallExpression(parent) &&
          parent.arguments[0] === node &&
          ["mock", "doMock"].includes(mockMethod(parent.expression) ?? "");
        if (
          !mockTarget &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require"))
        )
          dynamic(node, node.arguments[0], consumed(node), true);
        else if (method) {
          const factory = node.arguments.at(1);
          const argument = node.arguments.at(0);
          const moduleArgument =
            (method === "mock" || method === "doMock") &&
            argument &&
            ts.isCallExpression(argument) &&
            argument.expression.kind === ts.SyntaxKind.ImportKeyword
              ? argument.arguments[0]
              : argument;
          if (
            (method === "mock" || method === "doMock") &&
            factory &&
            (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory))
          ) {
            const names = new Set<string>();
            const returns: ts.Node[] = [];
            const originalParameter = factory.parameters.at(0);
            const gather = (child: ts.Node, nestedFunction = false) => {
              if (
                (!nestedFunction && ts.isReturnStatement(child)) ||
                (child === factory.body && !ts.isBlock(child))
              ) {
                returns.push(child);
                const expression = ts.isReturnStatement(child) ? child.expression : child;
                const object = expression && unwrap(expression);
                if (object && ts.isObjectLiteralExpression(object))
                  for (const member of object.properties)
                    names.add(
                      ts.isSpreadAssignment(member)
                        ? "*"
                        : ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)
                          ? member.name.text
                          : "*",
                    );
                else names.add("*");
              }
              if (
                ts.isCallExpression(child) &&
                ts.isIdentifier(child.expression) &&
                originalParameter &&
                checker.getSymbolAtLocation(child.expression) ===
                  checker.getSymbolAtLocation(originalParameter.name)
              )
                for (const name of consumed(child)) names.add(name);
              ts.forEachChild(child, (next) => {
                gather(next, nestedFunction || ts.isFunctionLike(child));
              });
            };
            gather(factory.body);
            if (returns.length === 0) names.add("*");
            dynamic(node, moduleArgument, [...names], true);
          } else dynamic(node, moduleArgument, consumed(node), true);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  result.diagnostics = result.diagnostics.filter(
    (diagnostic, index, all) =>
      all.findIndex(
        (other) =>
          other.file === diagnostic.file &&
          other.line === diagnostic.line &&
          other.column === diagnostic.column &&
          other.code === diagnostic.code &&
          other.message === diagnostic.message,
      ) === index,
  );
  return result;
}
