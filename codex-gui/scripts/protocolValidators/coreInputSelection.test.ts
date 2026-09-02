import path from "node:path";

import { describe, expect, test } from "vitest";

import { generateProtocolArtifacts, loadProtocolInputs } from "./core";
import {
  generate,
  nestedDefinitions,
  notificationDefinitions,
  requestDefinitions,
  schemaBundle,
  type JsonObject,
} from "./coreTestSupport";

const SELECTED_REQUEST_METHODS = [
  "initialize",
  "thread/projection/attach",
  "turn/start",
  "turn/interrupt",
] as const;

const SELECTED_NOTIFICATION_METHODS = [
  "thread/projection/event",
  "thread/projection/delta",
  "thread/projection/closed",
] as const;

describe("protocol validator input selection", () => {
  test("loads real Rust request and notification metadata", async () => {
    const schemaDirectory = path.resolve(
      import.meta.dirname,
      "../../../codex-rs/app-server-protocol/schema/json",
    );
    const inputs = await loadProtocolInputs({
      schemaBundlePath: path.join(schemaDirectory, "codex_app_server_protocol.schemas.json"),
      requestDefinitionsPath: path.join(schemaDirectory, "client-request-definitions.json"),
      notificationDefinitionsPath: path.join(
        schemaDirectory,
        "server-notification-definitions.json",
      ),
    });

    const loadedRequestMethods = inputs.requestDefinitions.map(({ method }) => method);
    const loadedNotificationMethods = inputs.notificationDefinitions.map(({ method }) => method);
    for (const method of SELECTED_REQUEST_METHODS) expect(loadedRequestMethods).toContain(method);
    for (const method of SELECTED_NOTIFICATION_METHODS) {
      expect(loadedNotificationMethods).toContain(method);
    }
    const artifacts = await generateProtocolArtifacts({
      ...inputs,
      selectedRequestMethods: SELECTED_REQUEST_METHODS,
      selectedNotificationMethods: SELECTED_NOTIFICATION_METHODS,
      selectedAuxiliarySchemaIds: ["v2/TurnError"],
    });

    expect(artifacts["appServerPayloadValidators.raw.js"]).toContain(
      "ThreadProjectionEventNotification",
    );
    expect(artifacts["appServerPayloadValidators.raw.js"]).not.toContain(
      "windowsSandbox/setupCompleted",
    );
    expect(artifacts["jsonRpcEnvelopeValidators.raw.js"]).not.toContain(
      "ThreadProjectionEventNotification",
    );
    expect(artifacts["appServerPayloadValidators.js"]).not.toContain("../codex-gui/node_modules");
  });

  test("rejects a selected request missing from metadata", async () => {
    await expect(generate({ selectedRequestMethods: ["fixture/missing"] })).rejects.toThrow(
      /selected method.*fixture\/missing.*metadata/i,
    );
  });

  test.each([
    ["params", "v2/MissingParams"],
    ["response", "v2/MissingResponse"],
  ])("rejects a selected %s schema missing from the bundle", async (kind, schemaId) => {
    const definitions = requestDefinitions();
    definitions[0] = {
      ...definitions[0],
      [`${kind}Schema`]: schemaId,
    };

    await expect(generate({ requestDefinitions: definitions })).rejects.toThrow(
      new RegExp(`${kind} schema.*${schemaId}`, "i"),
    );
  });

  test("rejects duplicate request methods", async () => {
    await expect(
      generate({ requestDefinitions: [...requestDefinitions(), ...requestDefinitions()] }),
    ).rejects.toThrow(/duplicate method.*fixture\/test/i);
  });

  test("rejects duplicate notification methods", async () => {
    await expect(
      generate({
        notificationDefinitions: [
          ...notificationDefinitions(),
          ...notificationDefinitions().slice(0, 1),
        ],
      }),
    ).rejects.toThrow(/duplicate.*notification.*fixture\/selected/i);
  });

  test("rejects a selected notification missing from metadata", async () => {
    await expect(generate({ selectedNotificationMethods: ["fixture/missing"] })).rejects.toThrow(
      /selected notification.*fixture\/missing.*metadata/i,
    );
  });

  test("rejects a selected notification params schema missing from the bundle", async () => {
    const definitions = notificationDefinitions();
    definitions[0] = { ...definitions[0], paramsSchema: "v2/MissingNotification" };

    await expect(generate({ notificationDefinitions: definitions })).rejects.toThrow(
      /notification.*params schema.*v2\/MissingNotification/i,
    );
  });

  test("rejects a selected auxiliary schema missing from the bundle", async () => {
    await expect(generate({ selectedAuxiliarySchemaIds: ["v2/MissingAuxiliary"] })).rejects.toThrow(
      /auxiliary schema.*v2\/MissingAuxiliary/i,
    );
  });

  test("rejects duplicate schema ids in the selected closure", async () => {
    const bundle = schemaBundle();
    const v2 = nestedDefinitions(bundle);
    v2.FixtureResponse = { ...(v2.FixtureResponse as JsonObject), $id: "duplicate-id" };
    v2.Shared = { ...(v2.Shared as JsonObject), $id: "duplicate-id" };

    await expect(generate({ schemaBundle: bundle })).rejects.toThrow(
      /duplicate schema.*duplicate-id/i,
    );
  });

  test("walks the selected response and notification closures", async () => {
    const artifacts = await generate();
    const payloadSource = artifacts["appServerPayloadValidators.raw.js"];

    expect(payloadSource).not.toContain("FixtureParams");
    expect(payloadSource).toContain("FixtureResponse");
    expect(payloadSource).toContain("SelectedNotification");
    expect(payloadSource).toContain("Shared");
    expect(payloadSource).toContain("Left");
    expect(payloadSource).toContain("Right");
  });

  test("rejects an unresolved ref inside the selected closure", async () => {
    const bundle = schemaBundle();
    nestedDefinitions(bundle).Shared = { $ref: "#/definitions/v2/DoesNotExist" };

    await expect(generate({ schemaBundle: bundle })).rejects.toThrow(
      /unresolved.*#\/definitions\/v2\/DoesNotExist/i,
    );
  });

  test("ignores an unresolved ref outside the selected closure", async () => {
    await expect(generate()).resolves.toBeDefined();
  });

  test("does not traverse selected params schemas after confirming they exist", async () => {
    const bundle = schemaBundle();
    nestedDefinitions(bundle).FixtureParams = {
      $id: "shared-id",
      $ref: "#/definitions/v2/MissingParamsDependency",
    };
    nestedDefinitions(bundle).Shared = {
      ...(nestedDefinitions(bundle).Shared as JsonObject),
      $id: "shared-id",
    };

    await expect(generate({ schemaBundle: bundle })).resolves.toBeDefined();
  });
});
