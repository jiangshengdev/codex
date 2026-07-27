import { publicIndex, standaloneDeclarations } from "./appServerDeclarationArtifacts";
import { guiHostTypeScriptSources } from "./guiHostTypeScriptArtifacts";
import { notificationDescriptors } from "./notificationDescriptorArtifact";
import { requestDescriptors } from "./requestDescriptorArtifact";
import type {
  NotificationDefinitionMetadata,
  RequestDefinitionMetadata,
  TypeScriptFormatter,
} from "./typescriptArtifactTypes";

export type {
  NotificationDefinitionMetadata,
  RequestDefinitionMetadata,
  TypeScriptFormatResult,
  TypeScriptFormatter,
} from "./typescriptArtifactTypes";

type TypeScriptArtifactOptions = {
  requestDefinitions: readonly RequestDefinitionMetadata[];
  notificationDefinitions: readonly NotificationDefinitionMetadata[];
  selectedNotificationDefinitions: readonly NotificationDefinitionMetadata[];
  envelopeValidatorExports: ReadonlyMap<string, string>;
  payloadValidatorExports: ReadonlyMap<string, string>;
  formatTypeScript: TypeScriptFormatter;
};

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

async function formatArtifacts(
  sources: Readonly<Record<string, string>>,
  formatTypeScript: TypeScriptFormatter,
): Promise<Record<string, string>> {
  const artifacts: Record<string, string> = {};
  for (const fileName of Object.keys(sources).sort()) {
    artifacts[fileName] = await formatArtifact(fileName, sources[fileName], formatTypeScript);
  }
  return artifacts;
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
  return formatArtifacts(sources, formatTypeScript);
}

export async function generateGuiHostContractTypeScriptArtifacts({
  validatorExports,
  formatTypeScript,
}: {
  validatorExports: ReadonlyMap<string, string>;
  formatTypeScript: TypeScriptFormatter;
}): Promise<Record<string, string>> {
  return formatArtifacts(guiHostTypeScriptSources(validatorExports), formatTypeScript);
}
