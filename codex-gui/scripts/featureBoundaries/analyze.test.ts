import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { analyzeProject } from "./analyze";
import { runCli } from "./cli";
import type { BoundaryAnalysis, BoundaryDiagnosticCode, BoundaryPolicy } from "./contracts";

const roots: string[] = [];
const api = "src/features/provider/api.ts";
const consumer = "src/features/consumer/use.ts";
const helper = "src/features/provider/__tests__/helper.ts";

function makePolicy(): BoundaryPolicy {
  return {
    features: ["provider", "consumer"],
    publicModules: [
      {
        path: api,
        owner: "provider",
        exports: ["visible", "Shape", "default"],
        purpose: "Public production capability",
        audience: "production",
      },
      {
        path: "src/features/provider/safe.ts",
        owner: "provider",
        exports: ["visible"],
        purpose: "Complete public module",
        audience: "production",
      },
      {
        path: helper,
        owner: "provider",
        exports: ["fixture"],
        purpose: "Shared test fixture",
        audience: "testing",
      },
    ],
    allowedDirections: [
      { consumer: { feature: "consumer" }, target: "provider", audience: "production" },
    ],
    testSupportFiles: [],
    knownDirectionIssues: [],
  };
}

function fixture(files: Record<string, string> = {}, policy = makePolicy()) {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), "codex-gui-boundaries-"));
  roots.push(projectRoot);
  const contents = {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }),
    "tsconfig.app.json": JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        baseUrl: ".",
        paths: { "@/*": ["src/*"] },
      },
      include: ["src/features/**/*.ts"],
      exclude: ["**/__tests__/**"],
    }),
    [api]:
      "export const visible = 1; export const secret = 2; export interface Shape { value: number }; export default visible;",
    "src/features/provider/private.ts": "export const secret = 2;",
    "src/features/provider/safe.ts": "export const visible = 1;",
    [helper]: "export const fixture = { value: 1 };",
    [consumer]: "export {};",
    ...files,
  };
  for (const [file, source] of Object.entries(contents)) {
    const absolute = path.join(projectRoot, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return { projectRoot, policy };
}

function expectViolation(analysis: BoundaryAnalysis, file: string, code: BoundaryDiagnosticCode) {
  expect(analysis.diagnostics).toContainEqual(expect.objectContaining({ file, code }));
  for (const diagnostic of analysis.diagnostics) {
    expect(diagnostic.line).toBeTypeOf("number");
    expect(diagnostic.column).toBeTypeOf("number");
    expect(diagnostic.line).toBeGreaterThan(0);
    expect(diagnostic.column).toBeGreaterThan(0);
    expect(diagnostic.message.length).toBeGreaterThan(0);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("public capabilities and consumer directions", () => {
  test.each([
    "import { visible } from '@/features/provider/api'; void visible;",
    "import type { Shape } from '@/features/provider/api'; export type Value = Shape;",
    "import value from '@/features/provider/api'; void value;",
    "import * as safe from '@/features/provider/safe'; void safe.visible;",
    "const { visible } = await import('@/features/provider/api'); void visible;",
    "type Value = import('@/features/provider/api').Shape;",
    "const { visible } = require('@/features/provider/api'); void visible;",
    "import safe = require('@/features/provider/safe'); void safe.visible;",
  ])("permits declared capability: %s", (source) => {
    expect(analyzeProject(fixture({ [consumer]: source })).diagnostics).toEqual([]);
  });

  test("permits private implementation inside its owning feature, including tests", () => {
    const result = analyzeProject(
      fixture({
        "src/features/provider/internal.ts": "import { secret } from './private'; void secret;",
        "src/features/provider/__tests__/internal.test.ts":
          "import { secret } from '../private'; void secret;",
      }),
    );
    expect(result.diagnostics).toEqual([]);
  });

  test.each(["@/features/provider/api", "../provider/api"])(
    "rejects private members through %s",
    (specifier) => {
      const result = analyzeProject(
        fixture({ [consumer]: `\nimport { secret } from '${specifier}'; void secret;` }),
      );
      expectViolation(result, consumer, "private-export");
      expect(result.diagnostics.find((diagnostic) => diagnostic.file === consumer)?.line).toBe(2);
    },
  );

  test("rejects an unregistered module", () => {
    expectViolation(
      analyzeProject(
        fixture({ [consumer]: "import { secret } from '../provider/private'; void secret;" }),
      ),
      consumer,
      "private-module",
    );
  });

  test("requires an allowed direction even for a public symbol", () => {
    const policy = makePolicy();
    policy.allowedDirections = [];
    expectViolation(
      analyzeProject(
        fixture({ [consumer]: "import { visible } from '../provider/api'; void visible;" }, policy),
      ),
      consumer,
      "forbidden-direction",
    );
  });

  test("outer application assembly needs an exact consumer identity", () => {
    const file = "src/App.tsx";
    const files = { [file]: "import value from './features/provider/api'; void value;" };
    expectViolation(analyzeProject(fixture(files)), file, "forbidden-direction");
    const policy = makePolicy();
    policy.allowedDirections = [
      ...policy.allowedDirections,
      { consumer: { file }, target: "provider", audience: "production" },
    ];
    expect(analyzeProject(fixture(files, policy)).diagnostics).toEqual([]);
  });

  test("known reciprocal issues document ownership without granting private access", () => {
    const policy = makePolicy();
    policy.knownDirectionIssues = [
      {
        from: "consumer",
        to: "provider",
        issue: "docs/issues/ownership.md",
        description: "Retained contract direction",
      },
      {
        from: "provider",
        to: "consumer",
        issue: "docs/issues/ownership.md",
        description: "Retained reverse contract",
      },
    ];
    const result = analyzeProject(
      fixture({ [consumer]: "import { secret } from '../provider/api'; void secret;" }, policy),
    );
    expectViolation(result, consumer, "private-export");
  });

  test("an issue record cannot grant an undeclared dependency direction", () => {
    const policy = makePolicy();
    policy.allowedDirections = [];
    policy.knownDirectionIssues = [
      {
        from: "consumer",
        to: "provider",
        issue: "docs/issues/ownership.md",
        description: "Ownership remains unresolved",
      },
    ];
    expectViolation(
      analyzeProject(
        fixture({ [consumer]: "import { visible } from '../provider/api'; void visible;" }, policy),
      ),
      consumer,
      "forbidden-direction",
    );
  });
});

describe("policy validation and source discovery", () => {
  test.each(["path", "exports", "owner", "wildcard"])("rejects invalid policy %s", (kind) => {
    const policy = makePolicy();
    policy.publicModules = policy.publicModules.map((entry) =>
      entry.path !== api
        ? entry
        : {
            ...entry,
            ...(kind === "path" ? { path: "src/features/provider/missing.ts" } : {}),
            ...(kind === "exports" ? { exports: ["doesNotExist"] } : {}),
            ...(kind === "owner" ? { owner: "consumer" } : {}),
            ...(kind === "wildcard" ? { exports: ["*"] } : {}),
          },
    );
    expect(analyzeProject(fixture({}, policy)).diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid-policy" }),
    );
  });

  test("unregistered features fail closed even when no imports exist", () => {
    const file = "src/features/newFeature/entry.ts";
    expectViolation(
      analyzeProject(fixture({ [file]: "export const value = 1;" })),
      file,
      "unknown-feature",
    );
  });

  test("reports unresolved local targets instead of treating them as packages", () => {
    expectViolation(
      analyzeProject(
        fixture({ [consumer]: "import { value } from '../provider/missing'; void value;" }),
      ),
      consumer,
      "unresolved-module",
    );
  });

  test.each(["ts", "tsx", "mts", "cts", "d.ts", "d.mts", "d.cts"])(
    "scans untracked generated .%s outside production tsconfig include",
    (extension) => {
      const file = `src/generated/untracked.${extension}`;
      const result = analyzeProject(
        fixture({
          [file]:
            "import type { Shape } from '../features/provider/api'; export type Generated = Shape;",
        }),
      );
      expect(result.files).toContain(file);
      expectViolation(result, file, "forbidden-direction");
    },
  );
});

describe("module access and re-export provenance", () => {
  test.each([
    "import * as module from '../provider/api'; void module.secret;",
    "import * as module from '../provider/api'; export const clone = { ...module };",
    "import type * as Module from '../provider/api'; export type All = typeof Module;",
    "const module = await import('../provider/api'); void module.secret;",
    "type Hidden = typeof import('../provider/api').secret;",
    "const { secret } = require('../provider/api'); void secret;",
    "import module = require('../provider/api'); void module.secret;",
    "export { secret as leaked } from '../provider/api';",
    "export * from '../provider/api';",
  ])("rejects access to undeclared module members: %s", (source) => {
    expectViolation(analyzeProject(fixture({ [consumer]: source })), consumer, "private-export");
  });

  test("rejects private provenance through an outer utils chain", () => {
    const policy = makePolicy();
    policy.allowedDirections = [
      ...policy.allowedDirections,
      { consumer: { file: "src/utils/first.ts" }, target: "provider", audience: "production" },
    ];
    const result = analyzeProject(
      fixture(
        {
          "src/utils/first.ts": "export { secret as exposed } from '../features/provider/api';",
          "src/utils/second.ts": "export { exposed } from './first';",
          [consumer]: "import { exposed } from '../../utils/second'; void exposed;",
        },
        policy,
      ),
    );
    expectViolation(result, consumer, "private-export");
  });

  test("a public barrel cannot republish its owner's private symbol", () => {
    const policy = makePolicy();
    const barrel = "src/features/provider/barrel.ts";
    policy.publicModules = [
      ...policy.publicModules,
      {
        path: barrel,
        owner: "provider",
        exports: ["exposed"],
        purpose: "Attempted public facade",
        audience: "production",
      },
    ];
    expectViolation(
      analyzeProject(
        fixture(
          {
            [barrel]: "export { secret as exposed } from './api';",
            [consumer]: "import { exposed } from '../provider/barrel'; void exposed;",
          },
          policy,
        ),
      ),
      consumer,
      "private-export",
    );
  });

  test("rejects unknown dynamic feature targets", () => {
    expectViolation(
      analyzeProject(
        fixture({
          [consumer]:
            "declare const name: string; const module = await import(`../provider/${name}`); void module;",
        }),
      ),
      consumer,
      "indeterminate-access",
    );
  });

  test("locale templates and third-party modules remain outside feature governance", () => {
    const result = analyzeProject(
      fixture({
        "src/i18n.ts":
          "declare const locale: string; const messages = await import(`./locales/${locale}.po`); void messages;",
        [consumer]:
          "import { createElement } from 'react'; import { vi } from 'vitest'; vi.mock('react'); void createElement;",
      }),
    );
    expect(result.diagnostics).toEqual([]);
  });

  test("a source template under locales can traverse into features", () => {
    const file = "src/i18n.ts";
    expectViolation(
      analyzeProject(
        fixture({
          [file]:
            "declare const locale: string; const messages = await import(`./locales/${locale}/messages.ts`); void messages;",
        }),
      ),
      file,
      "indeterminate-access",
    );
  });
});

describe("production and testing capabilities", () => {
  test("helpers without test suffix can consume a declared testing API", () => {
    const file = "src/features/consumer/__tests__/support.ts";
    expect(
      analyzeProject(
        fixture({
          [file]: "import { fixture } from '../../provider/__tests__/helper'; void fixture;",
        }),
      ).diagnostics,
    ).toEqual([]);
  });

  test.each([consumer, "src/features/provider/production.ts"])(
    "production cannot import testing APIs from %s",
    (file) => {
      expectViolation(
        analyzeProject(
          fixture({
            [file]: "import { fixture } from '@/features/provider/__tests__/helper'; void fixture;",
          }),
        ),
        file,
        "production-to-testing",
      );
    },
  );

  test("production cannot consume a testing API indirectly through production modules", () => {
    const result = analyzeProject(
      fixture({
        "src/features/provider/relay.ts": "export { fixture } from './__tests__/helper';",
        "src/utils/relay.ts": "export { fixture } from '../features/provider/relay';",
        [consumer]: "import { fixture } from '../../utils/relay'; void fixture;",
      }),
    );
    expectViolation(result, consumer, "production-to-testing");
  });

  test("explicit outer test infrastructure is testing-only", () => {
    const file = "src/utils/test-utils.tsx";
    const policy = makePolicy();
    policy.testSupportFiles = [file];
    policy.allowedDirections = [
      ...policy.allowedDirections,
      { consumer: { file }, target: "provider", audience: "testing" },
    ];
    const files = { [file]: "export { fixture } from '../features/provider/__tests__/helper';" };
    expect(analyzeProject(fixture(files, policy)).diagnostics).toEqual([]);
    expectViolation(
      analyzeProject(
        fixture(
          {
            ...files,
            [consumer]: "import { fixture } from '../../utils/test-utils'; void fixture;",
          },
          policy,
        ),
      ),
      consumer,
      "production-to-testing",
    );
  });
});

describe("test mocking observes the same public surface", () => {
  const file = "src/features/consumer/__tests__/mock.test.ts";
  test.each(["mock", "doMock", "importActual"])("vi.%s cannot access private modules", (method) => {
    expectViolation(
      analyzeProject(
        fixture({
          [file]: `import { vi } from 'vitest'; vi.${method}('@/features/provider/private');`,
        }),
      ),
      file,
      "private-module",
    );
  });

  test.each([
    "const { secret } = await vi.importActual('@/features/provider/api'); void secret;",
    "vi.mock('@/features/provider/api', async (importOriginal) => { const { secret } = await importOriginal(); return { visible: secret }; });",
    "vi.mock('@/features/provider/api', async (importOriginal) => { const actual = await importOriginal(); return { ...actual }; });",
  ])("rejects private actual access: %s", (source) => {
    expectViolation(
      analyzeProject(fixture({ [file]: `import { vi } from 'vitest'; ${source}` })),
      file,
      "private-export",
    );
  });

  test("permits named original access and same-feature spies", () => {
    expect(
      analyzeProject(
        fixture({
          [file]:
            "import { vi } from 'vitest'; vi.mock('@/features/provider/api', async (importOriginal) => { const { visible } = await importOriginal(); return { visible }; });",
          "src/features/provider/__tests__/spy.test.ts":
            "import { vi } from 'vitest'; import * as internal from '../private'; vi.spyOn(internal, 'secret');",
        }),
      ).diagnostics,
    ).toEqual([]);
  });

  test("renaming the vitest import does not bypass actual-module checks", () => {
    expectViolation(
      analyzeProject(
        fixture({
          [file]:
            "import { vi as testApi } from 'vitest'; const { secret } = await testApi.importActual('@/features/provider/api'); void secret;",
        }),
      ),
      file,
      "private-export",
    );
  });

  test("an opaque mock factory cannot establish a public member set", () => {
    expectViolation(
      analyzeProject(
        fixture({
          [file]:
            "import { vi } from 'vitest'; declare function makeMock(): unknown; vi.mock('@/features/provider/api', () => makeMock());",
        }),
      ),
      file,
      "private-export",
    );
  });
});

describe("module-promise mock spies", () => {
  test("permits a same-feature implementation spy", () => {
    expect(
      analyzeProject(
        fixture({
          "src/features/provider/__tests__/moduleSpy.test.ts":
            "import { vi } from 'vitest'; vi.mock(import('../private'), { spy: true });",
        }),
      ).diagnostics,
    ).toEqual([]);
  });

  test("rejects a spy on another feature's private module", () => {
    const file = "src/features/consumer/__tests__/moduleSpy.test.ts";
    expectViolation(
      analyzeProject(
        fixture({
          [file]:
            "import { vi } from 'vitest'; vi.mock(import('../../provider/private'), { spy: true });",
        }),
      ),
      file,
      "private-module",
    );
  });
});

describe("Vite glob module access", () => {
  test("rejects eager access to another feature's private module", () => {
    expectViolation(
      analyzeProject(
        fixture({
          [consumer]:
            "const modules = import.meta.glob('../provider/private.ts', { eager: true, import: 'secret' }); void modules;",
        }),
      ),
      consumer,
      "private-module",
    );
  });

  test("rejects a private export in a public module", () => {
    expectViolation(
      analyzeProject(
        fixture({
          [consumer]:
            "const modules = import.meta.glob('../provider/api.ts', { eager: true, import: 'secret' }); void modules;",
        }),
      ),
      consumer,
      "private-export",
    );
  });

  test("rejects a wildcard feature target whose public surface is not proven", () => {
    expectViolation(
      analyzeProject(
        fixture({
          [consumer]:
            "const modules = import.meta.glob('../provider/*.ts', { eager: true }); void modules;",
        }),
      ),
      consumer,
      "indeterminate-access",
    );
  });

  test("permits an exact public named target and same-feature implementation", () => {
    expect(
      analyzeProject(
        fixture({
          [consumer]:
            "const modules = import.meta.glob('../provider/api.ts', { eager: true, import: 'visible' }); void modules;",
          "src/features/provider/internalGlob.ts":
            "const modules = import.meta.glob('./private.ts', { eager: true, import: 'secret' }); void modules;",
        }),
      ).diagnostics,
    ).toEqual([]);
  });
});

describe("CLI full-project integration", () => {
  test("returns success and prints a result for a fully scanned valid project", () => {
    const options = fixture({
      [consumer]: "import { visible } from '../provider/api'; void visible;",
    });
    const output: string[] = [];
    expect(runCli({ ...options, write: (text) => output.push(text) })).toBe(0);
    expect(output.join("\n")).not.toBe("");
  });

  test("returns failure with source location and reason for a file outside app include", () => {
    const file = "src/generated/new.d.ts";
    const options = fixture({
      [file]:
        "\nimport type { Shape } from '../features/provider/api'; export type Generated = Shape;",
    });
    const output: string[] = [];
    expect(runCli({ ...options, write: (text) => output.push(text) })).toBe(1);
    const text = output.join("\n");
    expect(text).toContain(file);
    expect(text).toMatch(/:2:\d+/);
    expect(text).toContain("forbidden-direction");
  });
});
