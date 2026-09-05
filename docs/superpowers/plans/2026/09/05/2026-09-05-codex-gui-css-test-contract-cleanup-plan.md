# Codex GUI CSS 测试契约清理实施计划

计划状态：待确认，尚未执行

日期：2026-09-05

设计依据：[CSS 测试契约清理设计](../../../../specs/2026/09/05/2026-09-05-codex-gui-css-test-contract-cleanup-design.md)

工作目录：`/Users/jiangsheng/cnb/codex`；分支：`dev`。

编写时基线：`1eb720676`。该提交已修正两个 `View` 查询和路由有效内容边界测量，保留其成果；不把设计中记录的旧失败当作当前仍失败的运行证据。编写时只有本次设计文档未跟踪，无产品源码未提交变更。

## 目标及硬边界

清理 GUI 自动化测试中无必要的 CSS 实现约束，保留明确约定的顶栏、正文与底部卡片左右对齐，以及内容可达、无遮挡、无意外溢出、滚动、焦点、输入、导航和错误恢复等行为保障。

只修改测试和仅服务被清理断言的测试辅助代码；不改生产 CSS、组件、HeroUI variants/tokens、协议、生成物、依赖、配置、AGENTS 或 skills。不新增视觉快照基线或 CSS token 自我比较，不关闭检查、不放宽误差掩盖缺陷，不通过测试数量或删减比例验收。

测试行为修改不混入纯位置重排。只清理失去用途的 import/helper，不做无关 import、函数或用例顺序整理。若确需独立的纯重排任务，须另列范围与提交，不作为本计划固有步骤。

本计划获确认后，先将本次设计与计划创建为独立本地提交，再执行测试清理。当前只授权计划落盘，本文不代表执行已经开始。

## 已核实环境及权威入口

- 项目工具链由 `codex-gui/AGENTS.md`、`codex-gui-toolchain` 和 `vitest-react-browser-docs` 管理；采用 fnm，不安装任何组件。
- 当前 Node `v24.17.0`、pnpm `10.34.5`、Vitest `4.1.10`、Playwright `1.62.1`；pnpm 来自用户 fnm 的 Node 安装目录。三浏览器缓存存在，本轮未运行测试。
- `package.json` 的 CI 使用 `format:oxfmt`；限定文件格式化使用已有 oxfmt，完成后以非 fix 入口复验。
- parallel 配置发现 `src/**/*.browser.test.ts(x)` 并排除 sequential；sequential 配置只发现 `src/__tests__/sequential/**`，禁止两个 Browser runner 同时运行。共享配置明确 `headless: true`，三浏览器均保留。
- Vite/TypeScript 实际协议别名指向 `codex-rs/gui-host/schema/typescript/browserContract.ts` 与 `codex-rs/app-server-protocol/schema/typescript`；入口文件、共享 projection fixtures/builders 均已核实存在。测试继续使用这些权威输入，不复制 DTO 或改生成链。
- 本地 Vitest 文档已核对可视断言：`toBeInViewport` 使用 IntersectionObserver，不能单独证明没有被其他元素遮挡。因此末条消息与控件的命中、重叠检查不能全部替换成这一断言。
- `e2e/app.spec.ts` 中现有窄屏检查保护内容可达和无溢出，当前安排只读保留。其 Playwright 配置可复用 5173 上的已有服务，故不因本计划扫描到 E2E 就自动启动或复用用户服务。

执行前重做必要预检，核验 HEAD、工作树、工具、目标收集与所需输入；编写时的检查不替代执行时检查。

## 分类标准与保留集合

每个命中项必须归入以下类别，并记录其用例、断言、处理理由与剩余保障。记录由主代理保存在执行上下文，不新增执行日志文件或回写本计划。

| 类别 | 处理 | 判定证据 |
| --- | --- | --- |
| 纯实现或装饰 | 删除断言；纯装饰用例可整项删除 | 指定类名、具体 padding/gap、颜色、圆角、阴影、装饰居中、固定行数或实现公式，没有独立用户行为后果 |
| 已确认视觉关系 | 保留实际边界比较 | 顶栏、正文、底部卡片的有效左右边界；历史列表比较整体区域，不要求每张卡片撑满多列网格 |
| 行为绑定实现 | 改为用户结果检查 | 先列出原失败路径和检测能力，再验证输入/键盘/滚动/焦点/遮挡等结果；不能只删除原断言 |
| 行为或测试输入 | 保留 | 视口尺寸、压力内容、事件参数、滚动测量 fixture、可访问性与功能断言；数值存在本身不是问题 |
| 证据不足 | 继续只读追踪原用例、调用方和关联证据 | 不机械删除，也不把全部 CSS 属性认定为必要保障；只有实质范围或产品决定变化才重新确认 |

不将菜单必须同宽、占位符必须同起点、chip 必须垂直居中、卡片必须等高等现状自动加入视觉关系保留集合。它们若只是视觉选择则清理；若相关用例包含输入可见性等行为则独立保留行为。

CSS 中直接承载内容语义的部分要区分处理。例如换行不能仅验证原始字符串仍有换行符，应检查用户可见换行；代码高亮不要求具体 token 类名，但代码文本与渲染语义仍需覆盖。

## 初始清理清单与文件所有权

下表路径以 `codex-gui/` 为根。文件清单是编辑节点的初始允许集合，执行时不得据搜索命中直接删除；必须逐项应用上述分类。仅被删除断言使用的文件内 helper/import 由同一 owner 清理。

### S：应用级测试

| 文件 | 删除或改写 | 保留 |
| --- | --- | --- |
| `src/__tests__/AppShell.browser.test.tsx` | 12px 历史 padding/间距 helper 与纯间距用例；CSS 类名黑名单；菜单 8px、40%、360 等复写实现公式及无依据同宽/最小尺寸；固定定位类检查 | 消息、错误、导航、菜单选择、选中项可见、滚动稳定、无重叠/溢出和已确认页面对齐；纯布局用例删除后不搬运同一约束 |
| `src/__tests__/AppRouting.browser.test.tsx` | 标题 `textOverflow === ellipsis` 等实现断言 | 完整标题身份、导航可达、窄屏不溢出；保留 `1eb720676` 的 Link 修正和有效左右边界测量，不重复修复旧问题 |
| `src/__tests__/HistoryPreviewChatLayout.browser.test.tsx` | `panelAppearance` 对颜色、边框、圆角、阴影的比较；固定顶部节奏、两卡片高度大小关系、底部空白等纯视觉检查 | 顶栏/正文/底卡边界；继续任务后的路由和读取行为；末条可聚焦、可见和不遮挡 |
| `src/__tests__/sequential/subagent-activity-responsive.browser.test.tsx` | `flexWrap`、`overflow`、`whiteSpace`、`textOverflow` 的精确值及强制截断实现 | 有界子代理集合、可访问名称、隐藏数量、长内容不导致意外溢出 |

只读保留对照：`src/__tests__/sequential/composer-viewport.browser.test.tsx` 的 viewport resize、Drawer 可达、焦点与溢出场景；`AppProjectionScroll.browser.test.tsx` 等滚动测试；`e2e/app.spec.ts` 窄屏行为用例。广义搜索中的 projection snapshot、协议字段、测试输入和剪贴板内容不属于 CSS 外观断言。

### E：编辑器测试

目录：`src/features/composerEditor/__tests__/`。

| 文件 | 删除或改写 | 保留 |
| --- | --- | --- |
| `ComposerEditorTypeaheadMenu.browser.test.tsx` | 外观和 token 对照；四边 6px、选项 10px；零动画；固定宽度/行数、overflow/contain、scroll owner 实现绑定 | 首尾候选键盘可见、hover 不改变或回滚选择、滚动不扰动外层、长内容及交互可达 |
| `ComposerEditorTypeaheadSelection.browser.test.tsx` | 选项类名、transform/transition 外观断言 | 选择、取消、输入和焦点行为 |
| `ComposerEditorSkillTokenPresentation.browser.test.tsx` | chip 类名/外观签名、垂直居中及固定宽度等装饰约束 | tooltip、无效原因、Tab、长内容适配和无意外横向溢出 |
| `ComposerEditorLifecycle.browser.test.tsx` | 占位视觉起点、固定 3/8 行、30% 或 overflow 值等实现要求 | 空/非空占位语义、编辑、自增长后长内容可滚动及可达 |

`ComposerEditorSkillTokenEditing.browser.test.tsx` 中选择和编辑几何输入只读复核，不能作为 CSS 测试批删。

### C：输入控制与状态测试

目录：`src/features/composerTurnControl/__tests__/`。

| 文件 | 删除或改写 | 保留 |
| --- | --- | --- |
| `ComposerTurnControlInput.browser.test.tsx` | `p-2`/`px-3` 等正反类名、icon-only 实现类、hover/颜色/阴影签名；invalid 的颜色类断言 | 编辑、焦点可识别、输入交互、无效原因、修正后状态与提交语义；不复制 HeroUI 配色契约 |
| `CurrentThreadStatus.browser.test.tsx` | dot 尺寸/颜色、文字类及背景/边框/动画黑名单 | 状态文字、ARIA、装饰点不进入可访问内容、无意外交互入口 |
| `ComposerTurnControlDelivery.browser.test.tsx` | danger/soft 等按钮外观类 | Stop 与队列投递行为 |
| `ComposerTurnControlPendingInput.browser.test.tsx` | chip 视觉类及外观一致性 | 排队、编辑、tooltip 与状态呈现 |

### H：历史、消息、分页及壳层控件测试

| 文件（位于 `src/features/`） | 删除或改写 | 保留 |
| --- | --- | --- |
| `committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceDisclosure.browser.test.tsx` | 不存在 `gap-2` 等类名要求 | 折叠、展开、内容与性能边界 |
| `committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceMessages.browser.test.tsx` | `card--secondary`、token 类等外观；whiteSpace/display 改为可见内容语义 | Markdown、消息、换行和代码文本呈现 |
| `committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx` | 固定 16/8px、局部 padding、装饰居中/分隔线；固定 4px 焦点范围 | 分页语义、键盘焦点可见且不裁切、内容边界与本地化 |
| `qrAccess/__tests__/QrAccessPopover.browser.test.tsx` | typography 类 | QR URL 与访问行为 |
| `appShell/__tests__/AppShellTopBar.browser.test.tsx` | 固定 4px focus ring 实现值 | 键盘聚焦、可辨识且完整的焦点指示、关闭后焦点恢复与导航 |
| `threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx` | 固定两行/clamp/hidden；网格等高等装饰要求 | 整卡 Enter、任务身份、完整可访问内容、列表区域对齐、加载错误和内容可达 |
| `threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx` | spacer 精确等高/增高等实现断言 | 末尾消息不被底栏遮挡，读取、错误与重试 |
| `threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx` | `overflowAnchor`、overflow 属性和 spacer 等高改为实际滚动、可达性结果 | 展开诊断后焦点、滚动位置稳定、末条消息可命中、诊断可滚动与重试 |

### 需要特别闭合的行为替代

1. **焦点指示**：不能以 `toHaveFocus` 代替“看得见且不被裁切”。读取实际绘制方式与祖先裁切区域，比较实际指示范围；测量用于证明可见性，不要求某个阴影或 outline token。若只支持某一种当前实现才能验证，应明确不足并继续寻找行为证据，不悄悄留下版本数值。
2. **诊断展开滚动**：当前直接比较 scrollTop 可能早于动画结束。先确认布局动画已静止和最终内容已出现，再判断滚动位置及末条可达；不关闭动画、不用固定 sleep、不让取消的动画 promise 造成伪失败。占位测量可以用作采样准备，不能把“必须有某个 spacer 且等高”当成产品完成条件。
3. **长内容与换行**：确保替代检查仍能发现内容不可访问或换行丢失；不以固定行数或仅 textContent 比较代替实际用户结果。

## 执行上下文与提交拓扑

不创建 worktree 或新分支。全部节点在 `/Users/jiangsheng/cnb/codex` 的 `dev` 上执行，Git index canonical target 为 `/Users/jiangsheng/cnb/codex/.git/index`。执行预检再用 Git 核实该路径未改变。

提交边界只有两个：D 为设计与计划文档独立提交；T 为本次测试契约清理提交。S/E/C/H 是同一 T 的不相交编辑节点，不是四个独立提交任务。共享工作树允许这些编辑并行，主代理唯一负责组合格式化、验证、暂存和提交。原提交不 amend、不 squash；提交后的修正必须新建提交。

独立审查代理只读稳定的完整 T diff，不参与修改。执行图状态、失败和锁记录保存在主代理上下文，不写回计划，不新增持久运行日志。

## 描述式 DAG

下列公共字段与逐节点记录共同构成完整节点定义；字段继承是计划表达的一部分。执行时按 `delegating-micro-stages/references/execution-graph.md` 编译动态图，按 `action-authorization/references/capability-envelope.md` 逐节点下发能力，不复制父代理全部能力。

公共字段：

- `executionContext`：上述共享 worktree、`dev` 和 Git index；owner 及文件写锁按节点限定。
- `subdelegation`：false；子代理不能继续委派。
- `deferralEvidence`：无；有真实资源冲突时等待具体资源，不制造依赖。
- `authorizationGate`：当前 pending，等待用户明确确认执行本计划；执行时仅在中央能力信封 active 后调度。
- `readSet`：本次设计/计划、适用规则、该节点消费的稳定产物；编辑节点另可读取所属生产模块和不可变测试支持，不能读取其他正在编辑节点的 mutable diff。
- `resourceLocks`：readSet 为 read，writeSet 为 write；下面列出的 runner、index 与格式化资源补充到对应节点。
- `stateEffects`：只允许 writeSet 及 commandScope 明确的主动变化；已授权程序自动缓存、日志和失败截图按项目规则管理，不主动清理用户进程或测试产物。
- `failureDomain`：该节点及消费其产物的传递后继；不相交分支继续。共享输入失效只影响实际消费者。
- `replanTriggers`：新外部变更、需要生产修改/范围外文件/安装/新视觉要求，或保留行为无法取得必要证据；计划内修正用动态图吸收，实质范围和风险变化才重新授权。
- `verification`：以该节点 completionEvidence 为准；运行入口与范围见验证章节。

| nodeId | taskBoundary / operationKind / owner | outcome、consumes → produces | hardPredecessors（原因） | readSet / writeSet / commandScope | completionEvidence / estimatedCost |
| --- | --- | --- | --- | --- | --- |
| P | 无提交 / 调查 / 主代理 | 当前状态与分类预检 → 稳定基线身份、S/E/C/H 逐断言清单、保留对照 | 无 | 全 GUI 测试和辅助代码、必要生产调用方只读；writeSet 空；rg/cat/Git 只读及工具版本查询 | 检索所有测试入口、排除误命中、每项有分类且父授权可执行；中 |
| DS | D / stage / 主代理 | 本次文档 → 精确 staged 文档快照 | P：确认基线和外部变更边界 | 两份本次文档；writeSet 为 Git index；精确 git add、cached diff/check | staged 集合仅设计与计划且 diff 检查通过；低 |
| DC | D / commit / 主代理 | staged 文档 → D commit | DS：消费已审文档快照 | staged 文档；writeSet 为 Git index/对象及当前分支引用；git commit | 独立 D commit id，源码未被纳入；低 |
| S | T / 编辑 / 应用测试代理 | S 清单 → 应用层清理 diff 与行为映射 | DC：文档独立提交已存在 | S 初始允许集合；writeSet 为该集合；普通源码编辑工具 | 每项删除/改写对应设计分类，保留行为映射，未越界；中 |
| E | T / 编辑 / 编辑器测试代理 | E 清单 → 编辑器清理 diff 与行为映射 | DC：同上 | E 初始允许集合；writeSet 为该集合；普通源码编辑工具 | 同上，键盘及长内容结果未丢失；高 |
| C | T / 编辑 / 输入控制测试代理 | C 清单 → 输入控制清理 diff 与行为映射 | DC：同上 | C 初始允许集合；writeSet 为该集合；普通源码编辑工具 | 同上，无效状态、队列与输入覆盖未丢失；中 |
| H | T / 编辑 / 历史消息测试代理 | H 清单 → 历史/消息/控件清理 diff 与行为映射 | DC：同上 | H 初始允许集合；writeSet 为该集合；普通源码编辑工具 | 同上，焦点、滚动和换行替代证据完整；高 |
| J | T / fan-in / 主代理 | 四份 diff/映射 → 冻结组合编辑结果、精确 changedFiles | S/E/C/H：等待组合状态全部稳定 | 四组结果及工作树只读；writeSet 空；git diff/status、静态搜索 | 未丢失外部变更；所有修改均在允许集合；低 |
| F | T / 格式化 / 主代理 | changedFiles → 格式化后的稳定 T 快照 | J：限定格式化输入 | writeSet 为 changedFiles；限定 oxfmt --write；独占这些文件 | 完整 diff 检查，无范围外输出，快照冻结供验证和 review；低 |
| R | T / 审查 / 独立审查代理 | 稳定 T 快照及清单 → 独立审查结论 | F：避免读取可变 diff | 全 GUI 测试只读，必要生产调用方；writeSet 空；rg/cat/Git 只读 | 逐项核对无误删行为、无伪清理、无漏项、无范围外变化；中 |
| VS | T / 验证 / 主代理 | 稳定 T 快照 → 格式与 lint 结果 | F：检查最终格式化输入 | GUI 输入只读；writeSet 无源码；format check、lint | 各入口单独退出成功；中 |
| VT | T / 验证 / 主代理 | 稳定 T 快照 → 项目类型检查结果 | F：检查最终组合输入 | GUI、协议类型和所有 tsconfig references；writeSet 无源码；type-check，锁定对应 tsbuildinfo | 包含 Browser、unit、E2E 测试类型的项目检查成功；中 |
| VB | T / 验证 / 主代理 | 稳定 T 快照 → parallel Browser 结果 | F：执行最终组合输入 | 受影响 parallel 文件及其依赖；独占 Browser runner；命令见下文 | 三浏览器实际收集目标，保留用例均通过；高 |
| VQ | T / 验证 / 主代理 | 稳定 T 快照 → sequential Browser 结果 | F：执行最终组合输入 | 受影响 sequential 文件及必要 composer viewport 对照；独占同一 Browser runner | 三浏览器实际收集目标且通过；中 |
| TS | T / stage / 主代理 | review 与检查证据 → 精确 staged T 快照 | R/VS/VT/VB/VQ：消费组合证据 | changedFiles 及结果；writeSet 为 Git index；精确 git add、cached diff/check | staged 等于已验证快照，仅本次测试修改；低 |
| TC | T / commit / 主代理 | staged T 快照 → T commit | TS：消费已审快照 | writeSet 为 Git index/对象及当前分支引用；git commit | 独立 T commit id；低 |
| Z | 无提交 / 验证 / 主代理 | D/T commit 与检查证据 → 最终状态报告 | TC：需要最终提交身份 | git status/show、证据只读；writeSet 空 | 最终状态与测试快照一致，必要任务和计划内修正完成，Level 1/2/3 如实报告；低 |

DS/DC/TS/TC 独占 canonical Git index；Git 对象和 `refs/heads/dev` 由主代理独占写。F 独占全部 changedFiles 的写访问。VB/VQ 共用 `/Users/jiangsheng/cnb/codex/codex-gui` 下 Vitest Browser runner、Vitest 自身 `dist/tsconfig.tmp.tsbuildinfo` 与浏览器资源，互斥执行。已核对 `node_modules/vitest/dist/chunks/index.UpGiHP7g.js` 的 `spawn`：通过 `--tsBuildInfoFile` 覆盖项目设置。该缓存的 canonical target 为 `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.pnpm/vitest@4.1.10_@types+node@24.13.3_@vitest+browser-playwright@4.1.10_vite@8.2.1_@types+n_d1aa2fd6dcc440d1779aec07f649e290/node_modules/vitest/dist/tsconfig.tmp.tsbuildinfo`，执行前重新解析确认。

VT 的 `tsc -b` 使用项目配置的 `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/` 下对应 tsbuildinfo，包括 `tsconfig.vitest.browser.tsbuildinfo`，不与上述 Vitest 缓存混同。VS 独占当前 GUI ESLint cache；VT 独占项目各 build-info。R、VS、VT 与单个 Browser runner 可在冻结输入上并行；同名入口之间不得并发写自身缓存。

初始 ready set 在执行授权成立后为 P。P 完成后 DS/DC 形成文档提交屏障，随后 S/E/C/H fan-out；J 是真实文件组合 fan-in。F 后 R/VS/VT/VB/VQ 同时满足依赖，仅 VB/VQ 因共享 runner 和缓存互斥，不设置虚构的文件先后依赖。TS 汇合全部最终证据。

预计关键路径：P、文档提交、E/H 中较慢编辑、J/F、互斥的 VB/VQ、TS/TC/Z。不存在 S→E→C→H 串行依赖。后续修正与 review/验证有读写冲突时先使受影响旧证据失效，再重算 ready set。

## 验证命令与参数边界

所有 pnpm 命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`，使用 `/opt/homebrew/bin/fnm exec --using-file pnpm`。执行阶段由主代理唯一运行格式化、生成类入口和测试。以下占位集合须由 J 发布的真实文件清单展开为独立参数，不能原样传入或用 shell eval 拼接。

| 目的 | 权威命令 | 参数及完成要求 |
| --- | --- | --- |
| 限定格式化 | `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write <changedFiles>` | 只含本次实际修改且仍存在的测试/辅助文件；检查完整输出 diff |
| 格式检查 | `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt` | 全项目非 fix，输出成功 |
| lint | `/opt/homebrew/bin/fnm exec --using-file pnpm run lint` | oxlint 与 eslint 均成功，不自动修复无关问题 |
| 类型 | `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check` | `tsconfig.json` references 包含应用、配置、unit、Browser 与 E2E 测试；Browser runner 还须无类型错误 |
| parallel Browser | `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel <parallelFiles>` | S/E/C/H 中修改后仍存在的非 sequential 文件作为一个组合调用；不按已删除用例名称过滤；保留三浏览器 |
| sequential Browser | `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential src/__tests__/sequential/subagent-activity-responsive.browser.test.tsx src/__tests__/sequential/composer-viewport.browser.test.tsx` | 前者是修改目标，后者验证输入区和 Drawer 行为；不与 VB 重叠 |
| diff | `git diff --check`、`git diff --cached --check` | cwd 为仓库根，审完整范围和 staged 身份 |

不跑全 Rust、后端/native 构建，不安装依赖，不做 remote 操作。只修改测试，无消息语义、catalog、schema、lockfile 生成；不触发 Lingui 提取或 `just fmt`。不修改 Browser runner 配置或全局关闭动画。

E2E、未修改纯逻辑单测、未变更 shared test helper 的广泛消费者默认不重跑。若新证据表明确有共享辅助代码需要改动，先确定其精确消费者、归属和验证节点；范围外文件不由本计划自动授权。E2E 只读检查发现必须修改时，回到该范围与运行入口的授权，不能自动复用已有 Vite。

## 失败吸收与退出条件

验证失败先分类并收集新证据，继续处理本次删除或改写直接引入的问题；不把首次失败、耗时或剩余用例数当作终止条件。原命令在输入不变时不盲目重跑；按实际失败域重编诊断、修正和必要复验节点。

只有明确需要新授权、外部状态、工具安装或产品决定，且没有当前范围内安全有效下一步时，暂停受影响节点。发现既有或无关问题必须记录证据，不修改它、不隐藏它，也不冒称全通过；其余独立节点继续。

独立审查不能只检查删了多少行，须对照 P 的逐项分类，证明具体数值/类名不再构成无依据契约，并证明行为检查仍能发现原本的用户失败。必要的几何 API 和动态绘制测量允许存在；grep 清零不是退出条件。

Level 1 必须记录实际执行文件、三浏览器结果、类型与静态检查。Level 2 对仅测试修改不要求整套重验；若某个替代断言的有效性确实依赖真实 Codex 状态，则新增对应节点并取得当时新的完整 GUI URL，缺失时标记该证据未执行，不能用既有 URL 或旧验收代替。Level 3 当前不适用；不打开可见窗口。

全部必要任务、最终验证和计划内修正完成后终止本轮。最终报告列出提交、删除/改写与保留边界、实际并行、关键路径、未启动 ready 节点及原因，并诚实区分未执行或受阻项。
