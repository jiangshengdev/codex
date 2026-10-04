import { readFile } from "node:fs/promises";

import { format } from "oxfmt";

import {
  generateStandaloneValidatorArtifacts,
  type StandaloneValidatorDependencies,
} from "./standaloneValidatorArtifacts";
import {
  generateGuiHostContractTypeScriptArtifacts,
  generateTypeScriptArtifacts,
  type AuxiliarySchemaMetadata,
  type NotificationDefinitionMetadata,
  type RequestDefinitionMetadata,
  type TypeScriptFormatter,
} from "./typescriptArtifacts";

type JsonObject = Record<string, unknown>;

type GeneratorDependencies = StandaloneValidatorDependencies & {
  formatTypeScript?: TypeScriptFormatter;
};

type GenerateProtocolArtifactsOptions = {
  schemaBundle: JsonObject;
  requestDefinitions: readonly JsonObject[];
  notificationDefinitions: readonly JsonObject[];
  selectedRequestMethods: readonly string[];
  selectedNotificationMethods: readonly string[];
  selectedAuxiliarySchemaIds: readonly string[];
  dependencies?: GeneratorDependencies;
};

type ProtocolInputs = {
  schemaBundle: JsonObject;
  requestDefinitions: JsonObject[];
  notificationDefinitions: JsonObject[];
};

type GuiHostContractInputs = {
  schemaBundle: JsonObject;
};

const APP_SERVER_SCHEMA_BUNDLE_ID = "https://openai.com/codex/app-server-protocol.schema.json";
const GUI_HOST_SCHEMA_BUNDLE_ID = "https://openai.com/codex/gui-host-browser-contract.schema.json";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
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

function schemaDefinition(bundle: JsonObject, schemaId: string): unknown {
  let value = bundle.definitions;
  for (const part of schemaId.split("/")) {
    if (!isObject(value) || !(part in value)) return undefined;
    value = value[part];
  }
  return value;
}

function validateSchemaExists(bundle: JsonObject, schemaId: string, label: string): void {
  if (schemaDefinition(bundle, schemaId) === undefined) {
    throw new Error(`${label} schema is missing from the bundle: ${schemaId}`);
  }
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

function selectAuxiliarySchemas(
  schemaBundle: JsonObject,
  selectedAuxiliarySchemaIds: readonly string[],
): AuxiliarySchemaMetadata[] {
  return selectedAuxiliarySchemaIds.map((schemaId) => {
    const schema = schemaDefinition(schemaBundle, schemaId);
    if (!isObject(schema)) {
      throw new Error(`Auxiliary schema is missing from the bundle: ${schemaId}`);
    }
    const schemaPath = schemaId.split("/");
    const typeName = schemaPath.at(-1);
    if (
      schemaPath.length !== 2 ||
      schemaPath[0] !== "v2" ||
      !typeName ||
      !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(typeName)
    ) {
      throw new Error(`Unsupported auxiliary TypeScript schema: ${schemaId}`);
    }
    const required = schema.required ?? [];
    if (!isStringArray(required)) {
      throw new Error(`Auxiliary schema required properties must be strings: ${schemaId}`);
    }
    return { schemaId, typeName, requiredProperties: required };
  });
}

export async function generateProtocolArtifacts({
  schemaBundle,
  requestDefinitions,
  notificationDefinitions,
  selectedRequestMethods,
  selectedNotificationMethods,
  selectedAuxiliarySchemaIds,
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
  const selectedAuxiliarySchemas = selectAuxiliarySchemas(schemaBundle, selectedAuxiliarySchemaIds);
  validateSchemaExists(schemaBundle, "JSONRPCMessage", "JSON-RPC envelope");
  const envelopeRuntime = await generateStandaloneValidatorArtifacts({
    basename: "jsonRpcEnvelopeValidators",
    schemaBundle,
    schemaBundleId: APP_SERVER_SCHEMA_BUNDLE_ID,
    rootSchemaIds: ["JSONRPCMessage"],
    allErrors: false,
    messages: false,
    dependencies,
  });
  const payloadRuntime = await generateStandaloneValidatorArtifacts({
    basename: "appServerPayloadValidators",
    schemaBundle,
    schemaBundleId: APP_SERVER_SCHEMA_BUNDLE_ID,
    rootSchemaIds: [
      ...selectedRequests.map(({ responseSchema }) => responseSchema),
      ...selectedNotificationDefinitions.map(({ paramsSchema }) => paramsSchema),
      ...selectedAuxiliarySchemas.map(({ schemaId }) => schemaId),
    ],
    allErrors: false,
    messages: false,
    dependencies,
  });
  const typeScriptArtifacts = await generateTypeScriptArtifacts({
    requestDefinitions: selectedRequests,
    notificationDefinitions: parsedNotificationDefinitions,
    selectedNotificationDefinitions,
    selectedAuxiliarySchemas,
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
  const runtime = await generateStandaloneValidatorArtifacts({
    basename: "standaloneValidators",
    schemaBundle,
    schemaBundleId: GUI_HOST_SCHEMA_BUNDLE_ID,
    rootSchemaIds: ["GuiAuthenticateParams", "GuiAuthenticateResult"],
    allErrors: true,
    messages: true,
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
