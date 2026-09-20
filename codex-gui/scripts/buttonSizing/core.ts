import ts from "typescript";

export type SizingReport = { entries: string[]; errors: string[] };
type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

// These are scenario boundaries, not an instruction to shrink every button.
const compactOwners = new Set([
  "ForkNotice",
  "ContinueTaskUnavailableAlert",
  "HistoryError",
  "ComposerPendingInputTrigger",
]);

export function inspectButtons(fileName: string, source: string): SizingReport {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const report: SizingReport = { entries: [], errors: [] };
  const imports = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const module = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings) && module.startsWith("@heroui/")) {
      namespaces.add(bindings.name.text);
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        const original = (binding.propertyName ?? binding.name).text;
        if (
          module.startsWith("@heroui/") ||
          /(?:RetryActionButton|FailureDiagnosticModal)$/.test(module)
        ) {
          imports.set(binding.name.text, original);
        }
      }
    }
  }
  const canonical = (name: string): string => {
    const [root = "", ...members] = name.split(".");
    return namespaces.has(root)
      ? members.join(".")
      : [imports.get(root) ?? root, ...members].join(".");
  };
  const attribute = (node: Opening, name: string): ts.JsxAttribute | undefined =>
    node.attributes.properties.find(
      (item): item is ts.JsxAttribute =>
        ts.isJsxAttribute(item) && item.name.getText(file) === name,
    );
  const literal = (node: Opening, name: string): string | undefined => {
    const value = attribute(node, name)?.initializer;
    if (value && ts.isStringLiteral(value)) return value.text;
    if (
      value &&
      ts.isJsxExpression(value) &&
      value.expression &&
      ts.isStringLiteral(value.expression)
    )
      return value.expression.text;
    return undefined;
  };
  const ancestors = (node: ts.Node): ts.Node[] => {
    const result: ts.Node[] = [];
    for (let parent = node.parent; !ts.isSourceFile(parent); parent = parent.parent)
      result.push(parent);
    return result;
  };
  const location = (node: ts.Node): string =>
    `${fileName}:${String(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1)}`;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = canonical(node.tagName.getText(file));
      const lineage = ancestors(node);
      const owner = lineage.find(ts.isFunctionDeclaration)?.name?.text ?? "";
      const button = [
        "Button",
        "ButtonGroup",
        "ToggleButton",
        "ToggleButtonGroup",
        "RetryActionButton",
        "FailureDiagnosticModal",
        "button",
      ].includes(name);
      const trigger = name.endsWith(".Trigger") || name.endsWith(".CloseTrigger");
      if (button || trigger) {
        const group = lineage.find(
          (parent): parent is ts.JsxElement =>
            ts.isJsxElement(parent) &&
            ["ButtonGroup", "ToggleButtonGroup"].includes(
              canonical(parent.openingElement.tagName.getText(file)),
            ),
        );
        const size = attribute(node, "size")
          ? literal(node, "size")
          : group
            ? literal(group.openingElement, "size")
            : undefined;
        report.entries.push(
          `${location(node)} ${name} ${size ?? "default/forwarded/library-owned"}`,
        );
        const inFailure = lineage.some(
          (parent) =>
            ts.isJsxElement(parent) &&
            canonical(parent.openingElement.tagName.getText(file)) === "FailureLayout",
        );
        const compact =
          button &&
          name !== "button" &&
          name !== "FailureDiagnosticModal" &&
          (compactOwners.has(owner) ||
            (fileName.endsWith("ComposerPersistenceStatus.tsx") && name === "Button") ||
            (fileName.endsWith("ThreadHistoryDetailContent.tsx") &&
              name === "RetryActionButton" &&
              inFailure) ||
            (fileName.endsWith("NewSessionPage.tsx") && name === "Button" && inFailure) ||
            (fileName.endsWith("ComposerPendingInputList.tsx") &&
              owner === "PendingInputGroup" &&
              literal(node, "slot") === "trigger"));
        if (name === "button" && compactOwners.has(owner)) {
          const forwarded =
            lineage.some(
              (parent) => ts.isJsxAttribute(parent) && parent.name.getText(file) === "render",
            ) && node.attributes.properties.some(ts.isJsxSpreadAttribute);
          if (!forwarded)
            report.errors.push(
              `${location(node)}: native compact button must receive HeroUI render props`,
            );
        }
        if (compact && size !== "sm")
          report.errors.push(
            `${location(node)}: compact scenario requires native sm (directly or from its group)`,
          );
        if (compact) {
          const classes = attribute(node, "className")?.initializer?.getText(file) ?? "";
          if (
            /(?:^|[\s"'`])(?:[\w-]+:)*(?:h|min-h|max-h|size|p|px|py|pt|pb|pl|pr|text)-(?:\d|\[|xs\b|sm\b|base\b|lg\b)/.test(
              classes,
            ) ||
            attribute(node, "style")
          ) {
            report.errors.push(
              `${location(node)}: compact button overrides native sizing; inspect computed geometry`,
            );
          }
        }
        if (
          name === "FailureDiagnosticModal" &&
          attribute(node, "triggerSize") &&
          literal(node, "triggerSize") !== "sm"
        ) {
          report.errors.push(`${location(node)}: diagnostic action requires sm`);
        }
      }
    }
    if (
      ts.isBindingElement(node) &&
      node.name.getText(file) === "triggerSize" &&
      fileName.endsWith("FailureDiagnosticModal.tsx")
    ) {
      if (
        !node.initializer ||
        !ts.isStringLiteral(node.initializer) ||
        node.initializer.text !== "sm"
      ) {
        report.errors.push(`${location(node)}: diagnostic trigger default must be sm`);
      }
    }
    if (
      ts.isCallExpression(node) &&
      canonical(node.expression.getText(file)) === "buttonVariants"
    ) {
      report.entries.push(`${location(node)} buttonVariants (styled trigger)`);
      if (fileName.endsWith("MarkdownTableCopyMenu.tsx")) {
        const options = node.arguments.at(0);
        const size =
          options && ts.isObjectLiteralExpression(options)
            ? options.properties.find(
                (property): property is ts.PropertyAssignment =>
                  ts.isPropertyAssignment(property) && property.name.getText(file) === "size",
              )
            : undefined;
        if (!size || !ts.isStringLiteral(size.initializer) || size.initializer.text !== "sm") {
          report.errors.push(
            `${location(node)}: Markdown table copy trigger must retain native sm`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return report;
}

// CSS is a separate input: JSX size cannot prove the final rendered dimensions.
// Preserve the existing wrapping owner; its responsive geometry is browser-tested.
export function inspectButtonCss(fileName: string, source: string): SizingReport {
  const report: SizingReport = { entries: [], errors: [] };
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1];
    const declarations = match[2];
    if (!/button|data-markdown-action/.test(selector)) continue;
    report.entries.push(`${fileName}: ${selector.trim()}`);
    for (const declaration of declarations.split(";")) {
      const [property = "", value = ""] = declaration.split(":").map((part) => part.trim());
      if (!/^(?:height|min-height|max-height|padding(?:-[\w-]+)?|font-size)$/.test(property))
        continue;
      const wrappingValues: Partial<Record<string, Partial<Record<string, readonly string[]>>>> = {
        ".failure-layout .button": {
          height: ["auto"],
          "min-height": ["2.5rem", "2.25rem"],
          "padding-block": ["0.25rem"],
        },
        ".failure-layout .button--sm": { "min-height": ["2.25rem", "2rem"] },
        ".failure-layout .button--lg": { "min-height": ["2.75rem", "2.5rem"] },
      };
      const allowed =
        fileName.endsWith("feedback/failureLayout.css") &&
        wrappingValues[selector.trim()]?.[property]?.includes(value);
      if (!allowed)
        report.errors.push(
          `${fileName}: unsupported button sizing CSS: ${selector.trim()} { ${property}: ${value} }`,
        );
    }
  }
  return report;
}
