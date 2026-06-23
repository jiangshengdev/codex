# projection typed fixture 入口设计

## 目标

将 `codex-gui` projection JSON fixture 的协议类型断言集中到一个测试专用入口，避免各测试文件重复手写 `as ThreadProjection...`。本改动只整理测试数据入口，不改变 fixture JSON 内容、测试断言语义或生产代码行为。

## 决策

- typed fixture 入口放在 `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`。
- 入口只服务测试代码，不从 `codex-gui/src/features/projection/index.ts` 或任何生产模块导出。
- 入口不放在 `codex-gui/src/features/projection/__fixtures__/index.ts`，避免把手写 TypeScript 混入 Rust 生成 JSON fixture 目录。
- 入口只做逐个命名导出，不额外导出集合对象。
- 迁移范围包括 `codex-gui/src` 下相关 unit/browser 测试，以及 `codex-gui/e2e/app.spec.ts`。
- 不修改 Rust fixture 生成逻辑。
- 不修改 `projectionTestBuilders.ts` 的职责或导出形状。
- 不新增测试行为；现有测试继续覆盖 fixture 可导入性和使用方行为。

## 文件

新增：

- `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`

修改调用点：

- `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
- `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `codex-gui/e2e/app.spec.ts`

移除本地类型断言后，如果某个文件不再需要修改，实际实现时可以从调用点列表中剔除。

## Typed Fixture 入口

`projectionFixtures.ts` 导入现有 JSON payload 和 `@codex-protocol/v2` 的协议类型，然后导出 typed 常量：

- `attachBaseline`
- `attachReplacement`
- `closedBackpressure`
- `eventTurnStarted`
- `eventItemStarted`
- `eventItemCompleted`
- `eventTurnCompleted`
- `eventSubscriptionReplacement`

该文件不应导入 `projectionTestBuilders.ts`，也不应导入任何应用 reducer 或 component 模块。保持 helper 只依赖 JSON fixture 和协议类型，可以避免测试工具之间形成循环依赖，也让边界更容易理解。

## 迁移方式

`codex-gui/src` 下的调用点应将直接 JSON fixture import 加本地 cast 的模式，替换为从 `@/features/projection/__tests__/projectionFixtures` 命名导入。

目标形态示例：

```ts
import { attachBaseline, eventTurnStarted } from "@/features/projection/__tests__/projectionFixtures";
```

`codex-gui/e2e/app.spec.ts` 也应优先使用同一个 typed fixture 入口。如果该路径在 TypeScript 或 Playwright runtime 解析上暴露 E2E 特有的模块解析问题，则保留 E2E 本地 JSON import 作为唯一例外，并在实现说明中记录原因；不要因此扩大生产 API。

只有当 `@codex-protocol/v2` 的 type import 仅用于 JSON fixture cast 时，才应删除它。仍然构造派生 typed 对象的文件，应保留必要的协议类型 import。

## 边界与风险

应用侧 `tsconfig.app.json` 包含 `src`，只排除 `src/**/__tests__/*`。将 typed fixture helper 放在 `__tests__` 下，可以避免 helper 成为应用 type-check 或生产 import 表面的一部分。

`__fixtures__` 目录保存 Rust 生成的 JSON 数据。避免在该目录新增 TypeScript barrel，可以让生成产物和手写测试 helper 保持分离。

迁移不应重构 fixture builders、reducer tests、browser tests 或 E2E 行为。它应该是一次窄范围 import 清理。

## 验证计划

实现后，在 `codex-gui` 下运行：

```sh
pnpm run type-check
pnpm run test:unit
```

如果 browser test import 的变化需要额外验证，运行：

```sh
pnpm run test:browser
```

如果迁移了 `codex-gui/e2e/app.spec.ts`，用以下命令验证 E2E TypeScript 边界：

```sh
pnpm exec tsc -p e2e/tsconfig.json --noEmit
```

本工作不安装依赖。

## 非目标

- 移动或重新生成 JSON fixtures。
- 修改 Rust fixture 生成逻辑。
- 新增 `src/features/projection/index.ts`。
- 重组 `projectionTestBuilders.ts`。
- 修改测试断言或产品行为。
- 新增 package exports 或生产 feature barrels。
