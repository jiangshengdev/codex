# GUI Browser 验证缺少快速反馈入口

日期: 2026-08-24
状态: ✅ 已修复
范围: `codex-gui` CI、Browser Mode 与测试架构
优先级: P2

## 摘要

默认 `ci` 现已包含 Chromium Browser smoke，完整 Browser Mode 仍保留 parallel、sequential 与 Chromium、Firefox、WebKit 三浏览器覆盖；跨域总成和 session storage 测试契约也已按 owner 与生产 API 收敛。

## 问题

修复前，默认 `ci` 不运行 Browser Mode，交互回归只能通过完整的两套三浏览器矩阵发现；`App.browser.test.tsx` 同时覆盖多个 owner，测试支持层还复制了生产 session storage key 和序列化 shape，导致反馈慢、失败定位面宽，并存在契约漂移风险。

## 证据

- `codex-gui/package.json:10,23-26`：默认 `ci` 已包含 `test:browser:smoke`；完整 `test:browser` 仍依次运行 parallel 与 sequential。
- `codex-gui/vitest.browser.smoke.config.ts:4-13`：smoke 入口只收集 smoke 目录，并只运行 Chromium。
- `codex-gui/vitest.browser.parallel.config.ts:6-18`：parallel 入口保留 Browser Mode typecheck 和 Chromium、Firefox、WebKit 三浏览器。
- `codex-gui/vitest.browser.sequential.config.ts:5-19`：sequential 入口保留 Browser Mode typecheck、三浏览器以及 `fileParallelism: false`。
- `.github/workflows/codex-gui.yml:9-84`：quick 与 full 两个 job 无相互依赖，分别执行默认 `ci` 与完整 Browser Mode。
- `.github/workflows/blocking-ci.yml:33-36,53-66`：GUI reusable workflow 已接入阻塞 CI，并进入 `required.needs`。
- `codex-gui/src/__tests__/appBrowserTestSupport.ts:239-252`：Browser session seed 复用生产 `TOKEN_FRAGMENT_KEY`、`consumeBrowserAuthorizationSession` 和 `commitActiveThread`。
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx:502-511`：routing 测试通过生产 consumer 的 `getSnapshot()` 验证持久化结果，不再复制原始 JSON shape。
- 原 `App.browser.test.tsx` 的职责已拆分到 `AppShell.browser.test.tsx`、`AppProjectionTranscript.browser.test.tsx`、`AppComposerQueue.browser.test.tsx` 和 `AppActiveThreadSession.browser.test.tsx`；routing 由 `AppRouting.browser.test.tsx` 独立负责。
- 五个 smoke 用例集中在三个 `src/__tests__/smoke/*.browser.test.tsx` 文件中，且没有重复保留在完整套件中。

## 判断

该问题已修复。当前验证拓扑同时具备默认链路中的快速 Chromium 交互反馈和独立的完整三浏览器覆盖；sequential 的串行约束未被削弱，测试职责与生产 session 契约的漂移风险也已消除。

## 修复记录

- `dac149c6c14a3571aa9518165bf77eafd2a6c7e1`：测试 session seed 复用生产 API。
- `ddd151654fb93babe969c1562b9e649c3bc073f5`：迁移五个 smoke 用例。
- `72b397382ed4224f6b779075abefbe96094e112a`：按 owner 拆分 App Browser 测试。
- `f4b5b342abef74e2c2b32b924e26d3c50b735482`：统一 Browser Mode 配置来源。
- `f73289a2579dcc009519f7f8f63812e0ca1e749a`：新增 Chromium smoke 默认入口。
- `5d1e7ef4d60af01c557df7c6498ebbe7f0d3072b`：新增阻塞 GUI workflow。
- `3760c3a8c4217cb7f63edcdd510028654a578dce`：routing 测试改由生产 session reader 验证。

## 验证记录

- `pnpm run ci` 通过：53 个 unit 文件、780 个 unit 测试，以及 3 个 smoke 文件、5 个 smoke 测试全部通过。
- `pnpm run test:browser` 通过：parallel 为 72 个文件、810 个测试；sequential 为 9 个文件、21 个测试；两套均覆盖 Chromium、Firefox、WebKit，且无 type errors。
- 独立最终审计通过；`git diff base..HEAD --check` 通过，最终代码工作树干净。
- 仓库根 `pnpm run format` 因预存的 `AGENTS.md` 内容触发 Prettier bug 而失败：代码示例字符串中的两个前导空格被改成一个，破坏了示例语义。该文件与失败均非本次修复引入。

## 影响

- 默认 `ci` 现在能够发现关键浏览器交互、路由和 owner 协调回归。
- 完整三浏览器矩阵继续承担跨浏览器与串行场景验证，没有用缩减覆盖换取速度。
- App Browser 测试按 owner 分离，失败定位范围更窄。
- 测试 session fixture 与生产 API 共用契约，避免 key 或 shape 双份维护。

## 后续处理

无需继续修改代码。首次真实 GitHub PR 运行可补充远端 runner 证据；当前仅完成了 workflow 结构、脚本入口和本地执行验证，这不影响本 issue 的已修复判定。

## 历史记录

- 2026-08-24：静态核对确认默认 `ci` 未包含 Browser Mode，完整入口需要依次运行 parallel 与 sequential 两套三浏览器配置。
- 2026-08-24：原 `App.browser.test.tsx` 横跨路由、连接、projection、transcript、Composer queue 和线程切换；`appBrowserTestSupport.ts` 同时手写生产 storage key 与 `{ token, activeThreadId }` shape。
