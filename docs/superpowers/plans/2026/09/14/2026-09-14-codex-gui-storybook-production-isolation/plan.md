# Storybook 演示内容与生产产物隔离实施计划

日期：2026-09-14

状态：两项票据的粒度与阻塞关系已确认；本轮计划落盘，实施尚未授权。

## 依据与交付边界

唯一设计依据：[设计 v2](../../../../../specs/2026/09/14/2026-09-14-codex-gui-storybook-production-isolation-design-v2.md)。错误旧版已删除，不作为输入。

只隔离为演示创建的场景、虚构数据、模拟控制及其专用资源。ThemePreferenceControl、ThemeProvider、主题偏好能力和其他生产组件及配套文案、样式继续归产品。当前调用关系只用于验证打包和影响面，不决定能力归属。归属不明的内容先查证，不迁移或删除。

生产构建保留对 Story 与预览入口的 TypeScript 检查。保持产品功能、Storybook 场景、中英文、真实 CSS/Provider 和主题展示，不改变产品主题入口。正常 bundler tree shaking 不变，不强制把不可达产品模块打入 JS，也不做通用死代码清理。

## 两项纵向票据

| Ticket | Blocked by | 可验证交付 |
| --- | --- | --- |
| [01 隔离演示专用语言资源](issues/01-isolate-demo-messages.md) | 无 | 提取、翻译迁移、加载、生产消息隔离与预览中英文完整性闭环 |
| [02 隔离演示专用样式输入](issues/02-isolate-demo-styles.md) | 无 | 扫描边界、生成 CSS、生产专用规则排除与真实预览渲染闭环 |

两票没有相互产物依赖。最终 JS 模块边界、完整构建、类型检查覆盖、体积对比及组合回归归汇合节点，不增加第三张横向测试票据。

## 当前证据与实施范围

当前分支为 `dev`，项目根为 `/Users/jiangsheng/cnb/codex`，下文源码路径相对此根。所有列为新增的文件是计划目标，不宣称已存在。

- `codex-gui/package.json`：`build` 为 `tsc -b && vite build`，`build-storybook` 是独立入口，保留两者职责。
- `codex-gui/tsconfig.app.json`：包含 `src` 和预览入口且 `noEmit`；不得排除 Story 以通过生产构建。
- `codex-gui/lingui.config.ts`：当前提取包含 `src`，source locale 为 `en`，locales 为 `en`、`zh-CN`；产品 `i18n` 加载既有两份 catalog。
- `codex-gui/src/storybook/StorybookEnvironment.tsx`：消费产品主题组件和语言能力。主题切换控件及其消息的来源保持在产品侧。
- `codex-gui/src/index.css` 与 `.storybook/preview.tsx`：当前共享 Tailwind 与产品样式入口；已有 Streamdown 显式 source、HeroUI token 和 Docs 修复必须保留。
- 已安装 Lingui 的 `@lingui/cli/api` 提供 catalog 访问入口；Catalog 的 `collect`、`readAll`、`merge`、`write` 可用于机械差集生成。原生多 catalog 提取独立处理，不能假设自动消除共享消息。

### 票据 01 写集合

- `codex-gui/lingui.config.ts`、`codex-gui/package.json` 的消息提取入口。
- 新增 `codex-gui/scripts/storybookIsolation/messages.ts` 及消息生成的聚焦测试。
- `codex-gui/src/storybook/StorybookEnvironment.tsx`，必要的预览专用语言加载模块。
- 产品 `codex-gui/src/locales/en.po`、`zh-CN.po`；新增预览 `codex-gui/src/storybook/locales/en.po`、`zh-CN.po`。
- 新增 `codex-gui/e2e/storybookIsolationMessages.spec.ts`；可扩展现有 `codex-gui/src/__tests__/i18n.test.ts`、`i18n.browser.test.tsx` 的受影响断言。

产品语言加载接口默认保持不变。不得编辑或移动主题组件、产品业务模块、依赖清单版本和锁文件。若需要调整同一范围内的生成模块组织，按执行图更新精确资源声明。

### 票据 02 写集合

- `codex-gui/src/index.css`、`codex-gui/.storybook/preview.tsx`。
- 新增 `codex-gui/.storybook/storybook.css` 作为预览样式入口；必要的共享 CSS 入口拆分限定于 `codex-gui/src/styles/`，保持单一产品样式定义。
- 新增 `codex-gui/e2e/storybookIsolationStyles.spec.ts`。

保留现有 `.storybook/preview.css` 的 Docs 规则。不得修改产品组件以制造更小 CSS，不重排无关样式声明。

### 汇合写集合

- 新增 `codex-gui/scripts/storybookIsolation/artifacts.ts` 和构建边界聚焦测试，负责 JS、语言及 CSS 的实际产物校验。
- `codex-gui/package.json` 中增加该校验的独立入口，由汇合 owner 消费票据 01 的稳定 package 文件后修改，避免共享写入。
- 必要的 `codex-gui/vite.config.ts` 构建观测仅用于获取模块图；若使用可选观测模式，必须保持实际生产入口和优化语义，不用替代打包配置证明隔离。

构建检查不能只搜索产物是否包含 Storybook 字符串，也不能把 source map 中出现源码名称直接等同于运行时执行。记录实际可加载文件集合与模块归属。复用工具输出优先于新增采集机制。

## 语言生成与单一翻译来源

将当前源码按已确认归属配置成产品提取域与演示提取域。当前演示内容位于 `src/storybook/**`；产品控件保持产品域。Story 文件命名只用于识别演示定义，不用于推断被其引用组件的归属。

生成逻辑通过 Lingui 提取的 identity 计算产品集合 P 与演示集合 D。产品 catalog 维护 P，预览 catalog 维护 D 减 P；共享 identity 只维护产品翻译。使用 Lingui 的 catalog API 读写与合并，不手写 PO 解析或镜像 Message 契约。

Catalog API 必须消费 Lingui normalized config；不能把 defineConfig 的输入直接当作归一化结果。沿已安装 CLI 的依赖解析取得官方配置加载能力，不硬编码 `.pnpm` 版本目录、不安装额外组件；实施预检验证该解析入口。

既有翻译迁移先读取原 catalog，再生成新集合；演示专用消息继承既有有效翻译与 context。生成器每次都执行差集分配，不能先双写再人工删重。对新增或变更归属的消息保持一致策略；产品与演示共享 identity 以产品为准，不能靠加载顺序覆盖不同翻译。

权威入口继续为 `pnpm run messages:extract`，其实现切换为项目包装入口，内部复用已安装 Lingui API。现有 `messages:extract:clean` 必须消费相同分区机制；正常迁移不能用全局 clean 顺便清掉无关历史记录。原始提取集合只在内存中存在。

完整持久生成边界仅为四份 PO：

- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`
- `codex-gui/src/storybook/locales/en.po`
- `codex-gui/src/storybook/locales/zh-CN.po`

人工只允许补充或迁移本次消息的 `msgstr`；identity、references、注释提取及 obsolete 状态由生成流程负责。完整审查首次生成结果与迁移状态，二次运行相同入口必须稳定。无关翻译变化、生成物越界、来源不明或反复漂移先定位并修正，不能默认接受。

预览加载产品 catalog 和预览差集后再激活既有 locale；产品 loader 不引用预览 catalog。ThemePreferenceControl 的消息必须仍出现在产品 catalog，形成正向保护断言。

## 样式输入与验证

生产与预览拥有明确的 Tailwind 扫描入口，产品基础样式只定义一次。生产排除演示域，预览包含生产与演示域；不能用同一个全局排除规则导致预览也丢失 utility。

保留全部生产组件源码扫描，尤其 `src/app/ThemePreferenceControl.tsx`。保留 HeroUI、Streamdown 等已有依赖 source 和语义 token。实际入口组织须先通过当前 Tailwind 的 source 行为验证，不能复制产品样式，也不能在最终 CSS 中删选择器。

使用明确只属于演示的已有类名验证隔离；若不存在可辨别的现有规则，测试使用临时输入构造唯一探针，不写入产品交互。相同 utility 只要属于产品输入，生产产物就允许保留。

## 验证入口与预检

以下命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`。执行前重新核对 package scripts、fnm 管理的 Node/pnpm、已安装依赖与浏览器、所需协议文件、测试收集、服务端口和输出目录；不能以本轮只读核验代替执行预检。缺失工具由用户安装，不自动安装。

- 消息：`/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`，完成翻译审查后重复同一入口。
- 静态：`/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`、`pnpm run lint`、`pnpm run format:oxfmt`；后两项同样通过 fnm 调用。Oxfmt 为权威格式检查，修复限定本次文件。
- 产品构建：`/opt/homebrew/bin/fnm exec --using-file pnpm run build`。
- Storybook：`/opt/homebrew/bin/fnm exec --using-file pnpm run build-storybook --disable-telemetry`。
- 产品本地化：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/__tests__/i18n.test.ts`；`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/__tests__/i18n.browser.test.tsx`。
- 票据 01：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookIsolationMessages.spec.ts`。
- 票据 02：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookIsolationStyles.spec.ts`。
- 最终生产预览：产品构建成功后，运行 `CI=1 PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookTheme.spec.ts e2e/storybookIsolationMessages.spec.ts e2e/storybookIsolationStyles.spec.ts`。当前 Playwright 配置在 CI 条件下使用 4173 的生产 preview，测试中的产品页面必须消费该 baseURL；默认 5173 开发服务器结果不能替代生产预览证据。CI 不复用已有服务，执行前核验 4173、6006 无冲突，不擅自终止用户服务。若发生配置允许的自动重试，保留首次失败并单独报告，不能将重试通过描述为首跑全绿。
- 最终演示回归：同一 `test:e2e` 入口运行 `e2e/storybookTheme.spec.ts`、`storybookRendering.spec.ts`、`storybookStateful.spec.ts`、`storybookConnectionRecovery.spec.ts`、`storybookConnectionRecoveryInteractions.spec.ts` 和五份 `storybookPendingInput*.spec.ts`，再消费两份新增测试的有效结果。

新增测试文件必须先存在并实际收集。当前 Playwright 默认无头运行 Chromium、Firefox、WebKit，使用前端与 Storybook webServer；不打开报告窗口。构建产物校验入口在汇合阶段实现为 `pnpm run verify:storybook-isolation`，只消费当前 `dist`、`storybook-static` 和构建观测结果，不偷偷重建或安装。此为新增入口，实施前不得按已存在命令调用。

首次源码编辑前保留基线产物证据到系统临时目录；最终用相同入口构建并比较。体积报告必须区分真实资源增减、压缩与 chunk 变化，不预设比例。若基线验证失败，记录精确失败并判断是否影响本目标，不使用错误构建结果比较。

Level 1 适用：实际产物校验、无头回归和生产预览证据。Level 2、Level 3 当前不适用，不声称真实会话或桌面验收。现有共享源码或配置变更使哪些结果失效，就重跑哪些检查；稳定输入已有证据可复用，不盲目扩大全套测试。

## 执行图契约

本节为描述式 DAG。下列共同字段、资源集合、动作模板与节点表合并构成每个节点的完整声明；执行时按 delegating-micro-stages 执行图契约实例化，不修改本计划来追记状态。

### 共同字段

- `authorizationGate`：目前仅文档写入 active；下表实施节点 pending，等待用户明确实施授权。随后由 action-authorization 逐节点生成最小信封。
- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` 工作树、`dev`、唯一 `/Users/jiangsheng/cnb/codex/.git/index`；不创建 worktree 或新分支。两票写集合不相交，允许在本工作树并行编辑；主代理独占 index，子代理不操作 Git。此具体安排优先于为每票额外创建工作树的默认建议，不授权项目外写入。
- `owner`：主代理负责基线、生成、格式化、组合验证与 Git；两票编辑可分别委派；独立审查由未修改相应产物的代理负责。
- `subdelegation`：所有子代理禁止再委派。每次一个微阶段，完成即信封到期。
- `estimatedCost`：预检、stage、commit 为短；审查和聚焦验证为中；两票编辑及双构建为长。仅用于调度，不设停止阈值。
- `deferralEvidence`：默认无。等待共享资源锁不建立票据阻塞边；任何额外暂缓须提供具体争用、收益、复查与失效条件。
- `failureDomain`：当前节点及消费其产物的后继；共同输入失效只扩展到实际消费者。一个语言失败不停止独立 CSS 编辑。
- `replanTriggers`：能力归属、生产行为、生成输出边界、工具或资源身份发生实质变化时局部重新判断；计划内错误继续定位、修正、复验，不弱化检查。

### 资源集合与动作模板

`D` 为设计 v2、总计划及两票；`L` 为票据 01 写集合；`C` 为票据 02 写集合；`F` 为汇合写集合。其 canonical 根均为 `/Users/jiangsheng/cnb/codex`。产品组件作为只读输入，不因被列入 readSet 而获得编辑授权。

| operationKind | readSet / writeSet | stateEffects / commandScope | resourceLocks | verification |
| --- | --- | --- | --- | --- |
| 调查 | 节点所需配置、源码、设计、工具 / 无 | 仅 cat、rg、只读 Git 核验 | 相应 canonical 文件 read | 当前路径、入口与边界证据 |
| 编辑 | 设计与本票输入 / L、C 或 F 中声明子集 | 普通源码 patch；移动使用 git mv 且主代理负责 | 对应文件 write，稳定依赖 read | diff 与目标语义一致 |
| 生成 | Lingui 配置和消息源码 / 四份 PO | 项目 messages:extract；完整输出审查 | src、生成器 read；四份 PO write | 翻译无丢失、差集正确、重复稳定 |
| 格式化 | 本节点稳定写集合 / 同集合 | 权威 formatter 的精确文件修复 | 格式目标 write | 非 fix 检查通过 |
| 验证 | 当前稳定源码和产物 / 正常验证产物 | 上述类型、lint、测试、构建与产物校验入口 | codex-gui/src 与配置 read；dist、storybook-static、test-results、playwright-report、node_modules/.tmp write；端口 5173、4173、6006 独占 | 实际收集且适用断言通过 |
| 审查 | 稳定 diff、设计与验证结果 / 无 | 只读独立审查 | 相应源码与 diff read | 无未闭合目标内问题 |
| stage | 节点稳定 allowlist / Git index | 精确 git add，diff --cached --check | /Users/jiangsheng/cnb/codex/.git/index write | 暂存集合与边界一致 |
| commit | 已审 staged 快照 / 本地 Git 提交 | git commit，不 amend、不 squash、不远程 | 同一 index write | commit id 与文件集合 |
| fan-in | 全部提交和有效证据 / 无 | 汇总结果 | 稳定产物 read | 整体满足设计 |

构建、提取和 runner 会读取整组可变源码，必须等待相关编辑释放读写冲突。其共享输出和端口采用实际 canonical 资源锁，不并发运行覆盖相同输出的构建或测试。若 runner 不使用某端口，可在执行预检后收紧锁。

### 节点与依赖

表中 `outcome / produces` 同时规定唯一产出；`consumes / completionEvidence` 指明后继解锁证据。T 分别实例化为 01、02，写集合分别为 L、C。

| nodeId | taskBoundary | operationKind | hardPredecessors 与原因 | outcome / produces | consumes / completionEvidence |
| --- | --- | --- | --- | --- | --- |
| P | 无 | 调查 | 无 | 环境与归属预检结果 | 当前工具、源码、授权；无关键缺口 |
| D-stage | 文档 | stage | P；核验目标 | 四份文档暂存快照 | D；allowlist 与 diff 检查 |
| D-commit | 文档 | commit | D-stage；消费 index | 独立文档提交 | staged D；commit id |
| B | 无 | 验证 | D-commit；实施前文档门禁 | 隔离前实际构建基线 | 稳定源码；产物身份和大小 |
| T-edit | T | 编辑 | B；先保存未修改基线 | 对应纵切源码与测试 | 设计与真实接口；本票稳定 diff |
| 01-generate | 01 | 生成 | 01-edit；消费新提取机制 | 四份稳定 catalog | 全部源消息、既有翻译；完整 diff 与重复稳定 |
| 01-format | 01 | 格式化 | 01-generate；消费完整语言产物 | 规范化 L | 本票源码与生成物；格式结果 |
| 02-format | 02 | 格式化 | 02-edit；消费样式产物 | 规范化 C | 本票稳定源码；格式结果 |
| T-verify | T | 验证 | T-format；消费本票产物 | 对应纵切有效验证结果 | 本票实际产物和聚焦测试通过 |
| T-review | T | 审查 | T-verify；消费稳定 diff | 独立审查结论 | 本票证据；问题闭环 |
| T-stage | T | stage | T-review；消费审查产物 | 本票暂存快照 | L 或 C；精确 staged diff |
| T-commit | T | commit | T-stage；消费 index | 独立任务提交 | commit id 与文件集合 |
| F-edit | 汇合 | 编辑 | 01-commit、02-commit；消费最终边界与 package | 产物校验入口及检查 | 两票稳定接口；F diff |
| F-format | 汇合 | 格式化 | F-edit；消费检查源码 | 规范化 F | 非 fix 检查通过 |
| F-verify | 汇合 | 验证 | F-format；消费全部源码 | 最终隔离与保护证据 | 双构建、JS/语言/CSS 检查、静态与场景回归、基线比较 |
| F-review | 汇合 | 审查 | F-verify；消费最终证据 | 最终独立审查结论 | 设计与组合 diff；无未闭合问题 |
| F-stage | 汇合 | stage | F-review；消费最终产物 | F 暂存快照 | 精确 allowlist 与 staged 检查 |
| F-commit | 汇合 | commit | F-stage；消费 index | 独立集成提交 | commit id 与文件集合 |
| Z | 无 | fan-in | F-commit；消费完整交付 | 完成报告 | 两票、修正、最终验证与提交全部齐备 |

实施授权后初始 ready set 为 P。B 后两票 fan-out；编辑可重叠，生成和全源验证按实际锁竞争，不把资源竞争改写成 02 依赖 01。共享 package 的汇合修改明确消费 01 的提交。F-edit 是两票完成后的 fan-in。关键路径为文档门禁、基线、较长纵切及最终组合验证。

失败属于新证据：增加定位、修正和复验节点，保留已经提交的身份；不得 amend。中间提交不要求独自满足整个计划，禁止为保持中间状态绿色添加临时兼容层、双写或 fallback。所有任务及计划内修正合并后的最终状态才决定完成。

## 提交与结束

实施前独立提交设计 v2、总计划和两票。之后两票各自独立本地提交，顺序由稳定产物和 index 锁决定；汇合检查作为独立集成提交。禁止混入无关变更、强制暂存忽略文件、远程操作以及行为修改夹带纯顺序调整。

本轮只落盘文档，不执行上述实施节点。用户后续明确授权实施后，连续完成目标内修正、验证与提交；全部完成后结束，不追加新任务。最终报告包含实际隔离证据、生产能力保护、验证层级、体积差异、并行与锁争用情况及本地提交身份。
