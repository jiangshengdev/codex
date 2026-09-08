# B13 工程入口与集成测试

基线：`63762612e56d332f474a5ba3861b22be761f0479`。状态：主审与独立复核完成。

## 覆盖与方法

75 文件分别由三个独立只读节点检查：I-B13-CONFIG 覆盖 27 顶层文件及 6 维护脚本/测试；I-B13-UI 覆盖 32 顶层 src 测试/支持文件与 2 utils；I-B13-E2E 覆盖 8 E2E 文件。主代理汇总证据，不重复声称自己全文审过所有文件。

锁文件按完整直接依赖声明与 importer 对应、相关 peer 版本、resolution integrity 和 frozen 安装机制检查，不逐行解释全部传递依赖，不包含联网漏洞审计。所有测试为静态阅读，本批未运行 lint、E2E、Browser、清理或构建。

## 七维结论

| 维度 | 结论 |
| --- | --- |
| 行为 | package script 与 CI 能对应；GUI CI 运行 ci 与 test:browser，不宣称运行 E2E。维护脚本入口 cwd 与输出范围一致。 |
| 生命周期 | App 测试通常保留真实 session/queue/Redux，仅 mock transport 回调；E2E 通过 page.routeWebSocket 模拟后端，真实 browser reload/存储生命周期可被测试，但不是 Core/host 保证。 |
| 异常恢复 | 模拟 start 故意不回复、持久化故障注入与 reload 检查能验证未知交付屏障；BFCache 仅合成 PageTransitionEvent，注释明确其边界。 |
| 契约与安全 | Vite/tsconfig alias 指向 Rust 权威 TypeScript；clean-test-artifacts 只删指定测试目录且不递归目录 symlink，未执行删除。测试 token 为模拟值，不作真实授权证据。 |
| 性能 | parallel/sequential 分区来源清楚，smoke 是 parallel 的子集；没有据测试数量、文件大小或并发数判定性能问题。 |
| 维护性 | README 模板指导与现配置脱节，见 QR-B13-001；依赖 peer 声明存在未核实影响的差异，见 QR-B13-003。 |
| 测试有效性 | 真实 owner 与 stub 的边界已区分；布局测量对缺节点默认零会削弱局部断言，见 QR-B13-002。QR-B03-001 的真实流式编辑组合缺口引用 B03，不重复计数。 |

## QR-B13-001：README 未成为当前工程的可用入口

分类：可维护性建议。优先级：P3。

`codex-gui/README.md:3` 仍介绍 minimal template；`:16` 建议启用 type-aware lint，而 `eslint.config.ts:37-38` 已启用；README `:46` 建议安装 package 已声明且 eslint 已启用的 react-x/react-dom 插件。维护者按 README 操作可能重复配置，并需自行倒查实际验证入口、协议输入与工具链。

根因是模板文档未跟随工程职责更新。整改涉及 README，更新为实际入口索引并链接 AGENTS/skill 的规范 owner，避免复制另一套易漂移规则。必须保留单一工具链规则来源，不借文档整改更改运行行为。验收为启动/验证/生成链说明与实际脚本及目录一致，删除已不适用的安装建议。

验证：配置和文档静态对照已确认；不需要运行测试证明文档不一致。

## QR-B13-002：部分布局测量在节点缺失时仍能通过

分类：可维护性建议（测试断言有效性）。优先级：P3。

`codex-gui/e2e/app.spec.ts:278-290` 对 `.surface`、`.committed-transcript-surface` 和 composer 使用可选链读取 right，缺失时为 0；`:297-301` 相关检查仅断言不超 viewport，仅 status 另有正值检查。class 改名或 selector 漂移后，该局部测量可从真实几何退化为恒定零仍通过。

当前载体仍存在，前置 article/composer 可见性与整页溢出断言也仍有效，因此不是“整个 E2E 失效”或“当前布局错误”的证据。

整改涉及布局测试的节点查找和测量：读取几何前确认预期载体存在且唯一，或对缺失显式失败。保留整页及元素边界断言，不删除覆盖或修改基线。验收为缺失目标清晰失败，正常场景继续使用真实测量。静态证据充分，本轮不修改测试或启动服务。

## QR-B13-003：ESLint 插件 peer 声明与解析版本不一致

分类：待验证风险。优先级：待实际兼容影响确认。

`pnpm-lock.yaml:2469-2473` 的 `eslint-plugin-react@7.37.5` peer 范围最高到 ESLint 9，`:6644-6652` 实际绑定 ESLint 10.9.1。`eslint.config.ts:40-41` 当前仅使用 jsx-runtime profile，不能由 peer 范围直接推出运行失败。

影响缺口：该实际配置路径在 ESLint 10 下是否触发不兼容 API，及 clean frozen 安装环境是否存在阻断；本轮没有安装、lint 或远程 CI 证据。

后续先核实当前消费规则兼容性，再决定是否调整依赖组合；不得通过忽略警告、扩大 peer 豁免或放宽检查掩盖问题。验收为依赖支持范围与实际使用一致，现有规则正常运行。本轮保留为兼容声明风险，不计确定缺陷。

## 关键排除依据

- 根 `package.json` 固定 pnpm 10.34.5，不能仅因前端 package 未单独写 packageManager 判断无版本来源。
- `AppComposerQueueOrdinary.browser.test.tsx:46-50` 的 queue `{ spy:true }` 保留实现；`appBrowserTestSupport.ts:294-301,326-337` 则绕过真实握手。两种替换性质不同。
- `AppRouting.browser.test.tsx:36-43` 仅显式 controller 场景替换 session；`AppNewSession.browser.test.tsx` 使用真实 router，不能因共享 render harness 没有 /new 就判定新会话路由未覆盖。
- `utils/test-utils.tsx:81-98` 每次创建独立 store/i18n；未见全局假状态污染所有测试。
- `playwright.config.ts:100-108` 本地复用现有端口，因此执行前必须核实服务身份；测试配置自身不证明固定基线。没有启动本轮 E2E。
- `scripts/large-files/cli.ts` 只用本地 Git 列 tracked 文件，写 `.reports`；它的输出不是本轮报告，也不把数字排名变成评审停止条件。

## 交接与验证边界

X01/X02/X03 引用真实 owner 集成覆盖，但保持 transport mock、合成 BFCache、模拟服务器与真实运行的区别。Level 2/3 未执行；各批引用的已有测试通过不能证明本报告三个发现已整改。
