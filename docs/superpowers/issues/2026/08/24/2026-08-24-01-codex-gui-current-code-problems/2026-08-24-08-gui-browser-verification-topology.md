# GUI Browser 验证缺少快速反馈入口

日期: 2026-08-24
状态: 🔴 仍需处理
范围: `codex-gui` CI、Browser Mode 与测试架构
优先级: P2

## 摘要

默认 `ci` 不执行 Browser Mode 或 E2E，而完整 Browser Mode 又需要依次运行两套三浏览器配置；当前缺少既能进入默认反馈链、又能保留完整覆盖的快速交互验证入口。

## 问题

GUI 的交互、路由、浏览器存储、projection、Composer queue 和线程切换等行为主要由 Browser Mode 总成测试覆盖，但默认 `ci` 只运行协议检查、格式、lint、类型检查和 unit tests。开发者只执行默认入口时，交互回归不会被这条链路发现。

现有完整 Browser Mode 入口依次运行 parallel 和 sequential 两套配置，每套都启用 Chromium、Firefox、WebKit 并执行 Browser Mode typecheck。这些配置分别服务可并行与必须串行的测试，三浏览器覆盖也具有跨浏览器验证价值；问题不是这些覆盖“不该存在”，而是没有更快的分层入口承担日常反馈。

同时，`App.browser.test.tsx` 已成为跨路由、连接、projection、transcript、Composer queue 和线程切换的总成测试面。部分 test support 还手写生产 session storage key 和序列化 shape，形成测试基础设施与生产实现之间的漂移风险。

## 证据

- `codex-gui/package.json:8-26`：默认 `ci` 仅运行 `protocol:check-validators`、格式、lint、`type-check` 和 `test:unit`，未包含 `test:browser` 或 `test:e2e`；`test:browser` 又按顺序执行 `test:browser:parallel` 与 `test:browser:sequential`。
- `codex-gui/vitest.browser.parallel.config.ts:15-27`：parallel 配置包含普通 `*.browser.test.*`，启用 Browser Mode typecheck，并在 Chromium、Firefox、WebKit 三个实例运行。
- `codex-gui/vitest.browser.sequential.config.ts:15-29`：sequential 配置关闭文件并行、限定 sequential 目录，同样启用 Browser Mode typecheck 和三浏览器实例。
- `codex-gui/src/__tests__/App.browser.test.tsx:88-108`：该测试直接接入 thread identity、transcript、thread runtime、Redux provider、GUI Host connection 与 Composer queue mock。
- `codex-gui/src/__tests__/App.browser.test.tsx:173-214`：测试内组装 RootApp、current task、history list、history detail 和 router，覆盖应用路由总成。
- `codex-gui/src/__tests__/App.browser.test.tsx:1264-1372`：同一总成测试覆盖普通发送、live commit、active turn 排队和 terminal event 后启动。
- `codex-gui/src/__tests__/App.browser.test.tsx:3264-3423`：同一总成测试还覆盖线程切换期间 capabilities、Redux、projection、queue owner 和清理的一致性。
- `codex-gui/src/__tests__/appBrowserTestSupport.ts:37,207-245`：测试支持层手写 `codex-gui.browserAuthorizationSession.v1`、清理逻辑以及 `{ token, activeThreadId }` 的存储 shape。
- `codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts:4,40-65,76-120,129-140`：生产代码独立拥有同一 storage key、消费流程、解析校验和序列化 shape；测试 helper 没有机械复用这些定义。
- 本轮未运行测试；结论来自当前配置与测试源码静态核对。

## 判断

问题仍需处理，但不能据此删除 parallel/sequential 分层或三浏览器覆盖。串行配置保护不能安全并发的测试，三浏览器矩阵用于发现浏览器差异，均有现实依据。

当前缺口是验证拓扑没有同时提供快速反馈与完整覆盖：默认 `ci` 漏掉交互行为，完整 Browser Mode 是两套三浏览器矩阵，而跨域总成与手写 test support 又提高了维护和定位成本。

## 影响

- 只运行默认 `ci` 时，浏览器交互、路由、真实 DOM 行为和跨 owner 协调回归可能未被发现。
- 为获得现有 Browser Mode 覆盖，需要进入完整矩阵，缺少低成本的日常反馈层。
- 跨域总成失败时，受影响边界较宽，定位根因需要同时排查多个 owner 和基础设施层。
- 测试支持层复制生产 session storage contract，生产 key 或 shape 演进时可能造成 fixture 漂移或误判。

## 后续处理

需要单独进入测试架构设计，明确快速 Browser 验证入口、默认 CI 与完整三浏览器矩阵的分层职责，并复核总成测试与生产 test support 契约的边界。后续不得以删除跨浏览器覆盖或把必须串行的测试改为并行为默认解决方式；具体调整与验证应在独立修复任务中处理。
