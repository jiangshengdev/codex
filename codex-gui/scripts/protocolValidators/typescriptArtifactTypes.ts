export type RequestDefinitionMetadata = {
  method: string;
  paramsSchema: string;
  responseSchema: string;
};

export type NotificationDefinitionMetadata = {
  method: string;
  paramsSchema: string;
};

export type TypeScriptFormatResult = {
  code: string;
  errors: readonly { message: string | null }[];
};

export type TypeScriptFormatter = (
  fileName: string,
  sourceText: string,
) => Promise<TypeScriptFormatResult>;
