import { readFile } from "node:fs/promises";

import Ajv, { type ValidateFunction } from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { build } from "esbuild";
import { format } from "oxfmt";

import {
  generateGuiHostContractTypeScriptArtifacts,
  generateTypeScriptArtifacts,
  type NotificationDefinitionMetadata,
  type RequestDefinitionMetadata,
  type TypeScriptFormatter,
} from "./typescriptArtifacts";

type JsonObject = Record<string, unknown>;

type GeneratorDependencies = {
  formatTypeScript?: TypeScriptFormatter;
  standaloneCode?: (validators: Readonly<Record<string, string>>) => string;
  bundleJavaScript?: (sourceText: string) => Promise<string>;
};

type GenerateProtocolArtifactsOptions = {
  schemaBundle: JsonObject;
  requestDefinitions: readonly JsonObject[];
  notificationDefinitions: readonly JsonObject[];
  selectedRequestMethods: readonly string[];
  selectedNotificationMethods: readonly string[];
  dependencies?: GeneratorDependencies;
};

type ProtocolInputs = {
  schemaBundle: JsonObject;
  requestDefinitions: JsonObject[];
  notificationDefinitions: JsonObject[];
};

type StandaloneGroupOptions = {
  basename: "jsonRpcEnvelopeValidators" | "appServerPayloadValidators" | "standaloneValidators";
  schemaBundle: JsonObject;
  schemaBundleId: string;
  rootSchemaIds: readonly string[];
  allErrors: boolean;
  dependencies: GeneratorDependencies;
};

type GuiHostContractInputs = {
  schemaBundle: JsonObject;
};

const GENERATED_HEADER = "// GENERATED CODE! DO NOT MODIFY BY HAND!\n";
const APP_SERVER_SCHEMA_BUNDLE_ID = "https://openai.com/codex/app-server-protocol.schema.json";
const GUI_HOST_SCHEMA_BUNDLE_ID = "https://openai.com/codex/gui-host-browser-contract.schema.json";
const VALIDATOR_ID_PREFIX = "https://openai.com/codex/gui-validator/";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequestDefinition(value: JsonObject): RequestDefinitionMetadata {
  const { method, paramsSchema, responseSchema } = value;
  if (typeof method !== "string") throw new Error("Request definition method must be a string");
  if (typeof paramsSchema !== "string") {
    throw new Error(`Request definition paramsSchema must be a string: ${method}`);
  }
  if (typeof responseSchema !== "string") {
    throw new Error(`Request definition responseSchema must be a string: ${method}`);
  }
  return { method, paramsSchema, responseSchema };
}

function parseNotificationDefinition(value: JsonObject): NotificationDefinitionMetadata {
  const { method, paramsSchema } = value;
  if (typeof method !== "string") {
    throw new Error("Notification definition method must be a string");
  }
  if (typeof paramsSchema !== "string") {
    throw new Error(`Notification definition paramsSchema must be a string: ${method}`);
  }
  return { method, paramsSchema };
}

function parseJsonObject(sourceText: string, label: string): JsonObject {
  const parsed: unknown = JSON.parse(sourceText);
  if (!isObject(parsed)) throw new Error(`${label} must contain a JSON object`);
  return parsed;
}

function parseDefinitions(sourceText: string, label: string): JsonObject[] {
  const parsed: unknown = JSON.parse(sourceText);
  if (!Array.isArray(parsed) || !parsed.every(isObject)) {
    throw new Error(`${label} must contain a JSON object array`);
  }
  return parsed;
}

export async function loadProtocolInputs({
  schemaBundlePath,
  requestDefinitionsPath,
  notificationDefinitionsPath,
}: {
  schemaBundlePath: string;
  requestDefinitionsPath: string;
  notificationDefinitionsPath: string;
}): Promise<ProtocolInputs> {
  const [schemaSource, requestDefinitionsSource, notificationDefinitionsSource] = await Promise.all(
    [
      readFile(schemaBundlePath, "utf8"),
      readFile(requestDefinitionsPath, "utf8"),
      readFile(notificationDefinitionsPath, "utf8"),
    ],
  );
  return {
    schemaBundle: parseJsonObject(schemaSource, "Schema bundle"),
    requestDefinitions: parseDefinitions(requestDefinitionsSource, "Request definitions"),
    notificationDefinitions: parseDefinitions(
      notificationDefinitionsSource,
      "Notification definitions",
    ),
  };
}

function schemaWithExpectedTitle(sourceText: string, expectedTitle: string): JsonObject {
  const schema = parseJsonObject(sourceText, `${expectedTitle} schema`);
  if (schema.title !== expectedTitle) {
    throw new Error(`${expectedTitle} schema must have title ${expectedTitle}`);
  }
  return schema;
}

export async function loadGuiHostContractInputs({
  paramsSchemaPath,
  resultSchemaPath,
}: {
  paramsSchemaPath: string;
  resultSchemaPath: string;
}): Promise<GuiHostContractInputs> {
  const [paramsSource, resultSource] = await Promise.all([
    readFile(paramsSchemaPath, "utf8"),
    readFile(resultSchemaPath, "utf8"),
  ]);
  const paramsSchema = schemaWithExpectedTitle(paramsSource, "GuiAuthenticateParams");
  const resultSchema = schemaWithExpectedTitle(resultSource, "GuiAuthenticateResult");
  return {
    schemaBundle: {
      $schema: paramsSchema.$schema ?? resultSchema.$schema,
      definitions: {
        GuiAuthenticateParams: paramsSchema,
        GuiAuthenticateResult: resultSchema,
      },
    },
  };
}

function decodePointerPart(part: string): string {
  return part.replaceAll("~1", "/").replaceAll("~0", "~");
}

function pointerParts(pointer: string): string[] {
  if (!pointer.startsWith("#/")) throw new Error(`Unsupported schema ref: ${pointer}`);
  return pointer.slice(2).split("/").map(decodePointerPart);
}

function getAtPath(root: unknown, parts: readonly string[]): unknown {
  let value = root;
  for (const part of parts) {
    if (!isObject(value) || !(part in value)) return undefined;
    value = value[part];
  }
  return value;
}

function setAtPath(root: JsonObject, parts: readonly string[], value: unknown): void {
  let target = root;
  for (const part of parts.slice(0, -1)) {
    const current = target[part];
    if (!isObject(current)) target[part] = {};
    target = target[part] as JsonObject;
  }
  const last = parts.at(-1);
  if (last === undefined) throw new Error("Cannot set an empty schema path");
  target[last] = structuredClone(value);
}

function schemaPointer(schemaId: string): string {
  return `#/definitions/${schemaId}`;
}

function validateSchemaExists(bundle: JsonObject, schemaId: string, label: string): void {
  if (getAtPath(bundle, pointerParts(schemaPointer(schemaId))) === undefined) {
    throw new Error(`${label} schema is missing from the bundle: ${schemaId}`);
  }
}

function collectSelectedBundle(bundle: JsonObject, rootSchemaIds: readonly string[]): JsonObject {
  const selected: JsonObject = {
    ...(typeof bundle.$schema === "string" ? { $schema: bundle.$schema } : {}),
    definitions: {},
  };
  const visitedPointers = new Set<string>();

  const visitPointer = (pointer: string): void => {
    if (visitedPointers.has(pointer)) return;
    const parts = pointerParts(pointer);
    const schema = getAtPath(bundle, parts);
    if (schema === undefined)
      throw new Error(`Unresolved schema ref inside selected closure: ${pointer}`);
    visitedPointers.add(pointer);
    setAtPath(selected, parts, schema);
    visitValue(schema);
  };
  const visitValue = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visitValue(item);
      return;
    }
    if (!isObject(value)) return;
    if (typeof value.$ref === "string") visitPointer(value.$ref);
    for (const child of Object.values(value)) visitValue(child);
  };

  for (const schemaId of rootSchemaIds) visitPointer(schemaPointer(schemaId));
  return selected;
}

function rejectDuplicateSchemaIds(values: readonly unknown[]): void {
  const owners = new Map<string, JsonObject>();
  const visited = new Set<JsonObject>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isObject(value) || visited.has(value)) return;
    visited.add(value);
    if (typeof value.$id === "string") {
      const owner = owners.get(value.$id);
      if (owner && owner !== value)
        throw new Error(`Duplicate schema id in selected closure: ${value.$id}`);
      owners.set(value.$id, value);
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const value of values) visit(value);
}

function validatorExportName(schemaId: string): string {
  const suffix = schemaId
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `validate${suffix || "Schema"}`;
}

function selectedRequestDefinitions(
  requestDefinitions: readonly JsonObject[],
  selectedRequestMethods: readonly string[],
  schemaBundle: JsonObject,
): RequestDefinitionMetadata[] {
  const byMethod = new Map<string, JsonObject>();
  for (const definition of requestDefinitions) {
    if (typeof definition.method !== "string") {
      throw new Error("Request definition method must be a string");
    }
    if (byMethod.has(definition.method)) throw new Error(`Duplicate method: ${definition.method}`);
    byMethod.set(definition.method, definition);
  }

  return selectedRequestMethods.map((method) => {
    const rawDefinition = byMethod.get(method);
    if (!rawDefinition) throw new Error(`Selected method ${method} is missing from metadata`);
    const definition = parseRequestDefinition(rawDefinition);
    validateSchemaExists(schemaBundle, definition.paramsSchema, `${method} params`);
    validateSchemaExists(schemaBundle, definition.responseSchema, `${method} response`);
    return definition;
  });
}

function selectNotificationDefinitions(
  notificationDefinitions: readonly JsonObject[],
  selectedNotificationMethods: readonly string[],
  schemaBundle: JsonObject,
): {
  notificationDefinitions: NotificationDefinitionMetadata[];
  selectedNotificationDefinitions: NotificationDefinitionMetadata[];
} {
  const parsedDefinitions: NotificationDefinitionMetadata[] = [];
  const byMethod = new Map<string, NotificationDefinitionMetadata>();
  for (const rawDefinition of notificationDefinitions) {
    const definition = parseNotificationDefinition(rawDefinition);
    if (byMethod.has(definition.method)) {
      throw new Error(`Duplicate notification method: ${definition.method}`);
    }
    byMethod.set(definition.method, definition);
    parsedDefinitions.push(definition);
  }

  const selectedNotificationDefinitions = selectedNotificationMethods.map((method) => {
    const definition = byMethod.get(method);
    if (!definition) {
      throw new Error(`Selected notification ${method} is missing from metadata`);
    }
    validateSchemaExists(schemaBundle, definition.paramsSchema, `${method} notification params`);
    return definition;
  });
  return { notificationDefinitions: parsedDefinitions, selectedNotificationDefinitions };
}

function buildAjvValidators(
  selectedBundle: JsonObject,
  validatorExports: ReadonlyMap<string, string>,
  schemaBundleId: string,
  allErrors: boolean,
): { ajv: Ajv; refs: Record<string, string> } {
  const ajv = new Ajv({
    strict: true,
    allowUnionTypes: true,
    allErrors,
    validateFormats: false,
    code: { esm: true, source: true },
  });
  ajv.addSchema({ ...selectedBundle, $id: schemaBundleId }, schemaBundleId);
  const refs: Record<string, string> = {};
  const usedExportNames = new Set<string>();
  for (const [schemaId, exportName] of validatorExports) {
    if (usedExportNames.has(exportName))
      throw new Error(`Duplicate validator export name: ${exportName}`);
    usedExportNames.add(exportName);
    const validatorId = `${VALIDATOR_ID_PREFIX}${encodeURIComponent(schemaId)}`;
    ajv.addSchema(
      { $id: validatorId, $ref: `${schemaBundleId}${schemaPointer(schemaId)}` },
      validatorId,
    );
    const validator: ValidateFunction | undefined = ajv.getSchema(validatorId);
    if (!validator) throw new Error(`Failed to compile validator: ${schemaId}`);
    refs[exportName] = validatorId;
  }
  return { ajv, refs };
}

async function defaultBundleJavaScript(sourceText: string): Promise<string> {
  const result = await build({
    banner: { js: GENERATED_HEADER.trimEnd() },
    bundle: true,
    format: "esm",
    platform: "browser",
    sourcemap: false,
    write: false,
    stdin: {
      contents: sourceText,
      loader: "js",
      resolveDir: import.meta.dirname,
      sourcefile: "standaloneValidators.raw.js",
    },
  });
  return result.outputFiles[0].text;
}

async function generateStandaloneArtifacts({
  basename,
  schemaBundle,
  schemaBundleId,
  rootSchemaIds,
  allErrors,
  dependencies,
}: StandaloneGroupOptions): Promise<{
  artifacts: Record<string, string>;
  validatorExports: ReadonlyMap<string, string>;
}> {
  for (const schemaId of rootSchemaIds) validateSchemaExists(schemaBundle, schemaId, schemaId);
  const selectedBundle = collectSelectedBundle(schemaBundle, rootSchemaIds);
  rejectDuplicateSchemaIds([selectedBundle]);

  const validatorExports = new Map<string, string>();
  for (const schemaId of [...new Set(rootSchemaIds)].sort()) {
    validatorExports.set(schemaId, validatorExportName(schemaId));
  }
  const { ajv, refs } = buildAjvValidators(
    selectedBundle,
    validatorExports,
    schemaBundleId,
    allErrors,
  );
  const generateStandalone =
    dependencies.standaloneCode ?? ((validatorRefs) => standaloneCode(ajv, validatorRefs));
  const opaqueSource = generateStandalone(refs);
  const rawSource = `${GENERATED_HEADER}${opaqueSource}`;
  const bundledSource = await (dependencies.bundleJavaScript ?? defaultBundleJavaScript)(rawSource);
  return {
    artifacts: {
      [`${basename}.raw.js`]: rawSource,
      [`${basename}.js`]: bundledSource,
    },
    validatorExports,
  };
}

export async function generateProtocolArtifacts({
  schemaBundle,
  requestDefinitions,
  notificationDefinitions,
  selectedRequestMethods,
  selectedNotificationMethods,
  dependencies = {},
}: GenerateProtocolArtifactsOptions): Promise<Record<string, string>> {
  const selectedRequests = selectedRequestDefinitions(
    requestDefinitions,
    selectedRequestMethods,
    schemaBundle,
  );
  const {
    notificationDefinitions: parsedNotificationDefinitions,
    selectedNotificationDefinitions,
  } = selectNotificationDefinitions(
    notificationDefinitions,
    selectedNotificationMethods,
    schemaBundle,
  );
  validateSchemaExists(schemaBundle, "JSONRPCMessage", "JSON-RPC envelope");
  const envelopeRuntime = await generateStandaloneArtifacts({
    basename: "jsonRpcEnvelopeValidators",
    schemaBundle,
    schemaBundleId: APP_SERVER_SCHEMA_BUNDLE_ID,
    rootSchemaIds: ["JSONRPCMessage"],
    allErrors: false,
    dependencies,
  });
  const payloadRuntime = await generateStandaloneArtifacts({
    basename: "appServerPayloadValidators",
    schemaBundle,
    schemaBundleId: APP_SERVER_SCHEMA_BUNDLE_ID,
    rootSchemaIds: [
      ...selectedRequests.map(({ responseSchema }) => responseSchema),
      ...selectedNotificationDefinitions.map(({ paramsSchema }) => paramsSchema),
    ],
    allErrors: false,
    dependencies,
  });
  const typeScriptArtifacts = await generateTypeScriptArtifacts({
    requestDefinitions: selectedRequests,
    notificationDefinitions: parsedNotificationDefinitions,
    selectedNotificationDefinitions,
    envelopeValidatorExports: envelopeRuntime.validatorExports,
    payloadValidatorExports: payloadRuntime.validatorExports,
    formatTypeScript: dependencies.formatTypeScript ?? format,
  });

  return {
    ...envelopeRuntime.artifacts,
    ...payloadRuntime.artifacts,
    ...typeScriptArtifacts,
  };
}

export async function generateGuiHostContractArtifacts({
  schemaBundle,
  dependencies = {},
}: GuiHostContractInputs & {
  dependencies?: GeneratorDependencies;
}): Promise<Record<string, string>> {
  const runtime = await generateStandaloneArtifacts({
    basename: "standaloneValidators",
    schemaBundle,
    schemaBundleId: GUI_HOST_SCHEMA_BUNDLE_ID,
    rootSchemaIds: ["GuiAuthenticateParams", "GuiAuthenticateResult"],
    allErrors: true,
    dependencies,
  });
  const typeScriptArtifacts = await generateGuiHostContractTypeScriptArtifacts({
    validatorExports: runtime.validatorExports,
    formatTypeScript: dependencies.formatTypeScript ?? format,
  });
  return {
    ...runtime.artifacts,
    ...typeScriptArtifacts,
  };
}
