# 新建会话工作目录实施计划

日期：2026-09-10

状态：待确认；本轮只落盘，未执行、未提交。

依据：[工作目录展示设计](../../../../../specs/2026/09/10/2026-09-10-new-session-working-directory-design.md)。用户在设计落盘后请求计划落盘，本计划沿用已讨论的产品决策。

## 交付与任务划分

只有一个产品任务：[01：目录信息条与完整路径查看](01-working-directory.md)。它交付从草稿 `cwd` 到目录显示、路径展开、断连呈现及应用级验证的完整切片，不按 UI、翻译、测试拆成独立产品票据。

任务无其他产品任务阻塞。执行前仍须确认本计划，并独立提交设计与计划文档。无需预重构，不增加兼容层，不创建 worktree；在当前 checkout 的 `dev` 分支工作。实施前核验分支、工作树与 index，发现不相关改动保留并隔离暂存范围。

此次按用户“计划落盘”要求使用项目既有 plans 目录保存待审阅计划和单独票据，不发布外部 tracker，不设置远程标签，也不创建另一份 `.scratch` 副本。票据粒度及阻塞边随本计划一起确认。

## 修改边界

- `codex-gui/src/features/newSession/NewSessionPage.tsx`：组合共用外壳、目录入口与完整路径 Popover，保持草稿和 commands 条件分支的业务语义。
- 可新增 `codex-gui/src/features/newSession/NewSessionWorkingDirectory.tsx`：仅承载目录展示和展开交互；若直接放在页面内已足够清楚，无需为拆文件而创建组件。
- `codex-gui/src/__tests__/AppNewSession.browser.test.tsx`：扩展现有应用入口测试，替换旧常驻完整路径的展示断言，同时保留目录绑定、草稿保留和请求参数断言。
- `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`：项目 extraction 的完整生成物边界；人工仅补充本次消息的翻译。
- 本主题文档可在实施前随设计一起提交；实施期间不改写本计划，运行状态在会话内维护。

不修改 newSession owner、协议、后端、连接恢复模块、共享编辑器行为、依赖和测试配置。需要扩大上述范围时，先报告具体原因及影响，再判断授权，不顺手重构。

## 实现约束

- `snapshot.cwd` 是唯一目录来源，名称只是展示派生，创建请求仍使用完整原值。
- 用 HeroUI `Surface`、`Button variant="ghost"`、`Popover`，文件夹图标使用已有图标依赖。浅色外壳与内容区使用 HeroUI surface、foreground、muted、separator 语义 token；实施前核对本地 API 和主题映射。
- 默认仅显示目录名；点击或键盘操作展开可选中的完整路径。不加复制按钮、分支、环境、目录切换或多余说明控件。
- 弹出层使用组件现有 portal 与焦点行为，避免外壳裁切；长名称截断，完整路径允许换行，根目录保持可辨识。
- 断连仍保留目录入口和路径查看，原有不可发送说明、编辑器挂载条件和重连逻辑不变。
- 创建失败反馈保持原有语义；共用外壳的布局调整不得让反馈、技能菜单或发送按钮失去可用性。
- 文案使用既有 Lingui macro，并按用途添加必要 translator comment。禁止手写协议或生成元数据。
- 不进行与行为修改无关的代码重排。若工具要求额外纯顺序调整，独立提交，不混入行为提交。

## 验证入口与生成链

已核验 package scripts、Browser parallel/shared 配置及 Lingui 配置：目标应用测试位于 parallel include 范围，使用 Chromium、Firefox、WebKit，shared 配置为 headless。执行前使用 `codex-gui-toolchain` 再检查 fnm、pnpm、浏览器及输入是否存在；缺失时由用户安装，不自动安装。

以下命令均在 `codex-gui` 工作目录使用 fnm 入口执行：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/__tests__/AppNewSession.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

`ci` 是当前组合门禁，覆盖 validators check、oxfmt check、lint、type-check、unit 和 Browser smoke；不另外重复相同检查。格式修复先核验仓库入口并限定本次文件，非 fix 检查必须通过。不触发仓库 `just fmt`，不运行后端构建。

Lingui 输入 owner 为源码 macro 与 `lingui.config.ts`；配置包含 `src`，排除截图和 trace，locale 为 `en`、`zh-CN`。第一次提取后审查两份完整 catalog diff，区分 references、comments、message identity、翻译和 obsolete 状态；补充本次翻译后再次使用同一入口提取，证明稳定。只接受能由本次源码变化解释的语义变化及合法定位元数据，禁止手工修回旧行号。超边界输出、无关语义变化或不稳定提取阻塞相关后继。

Level 1 覆盖：默认短名称、点击与键盘展开关闭、路径可选中、无复制按钮、长路径和根目录、断连可查看、切换任务后草稿目录不变、发送仍使用完整 `cwd`。测试不得只断言 CSS 类或替代原有业务检查。

Level 2 覆盖：取得当前完整 GUI URL，使用现有可用真实 runtime，在无头会话确认新建路由、浅色与深色主题、宽窄视口、Popover 定位、焦点返回、文本选择及无横向溢出；不发送真实消息或主动断开后端来制造状态。真实环境没有出现的断连场景明确标记未执行，其自动化证据单列。当前 URL、runtime、无头工具可用性在执行前核验；缺口不阻塞无依赖代码与 Level 1 工作，但不得据此宣称全部验收完成。

Level 3 不适用；不启动可见浏览器、DevTools、报告或 trace 窗口。

## 执行 DAG

以下共同字段逐项适用于每个节点，节点记录覆盖差异。字段含义遵循 delegating-micro-stages 的执行图契约。

- `owner`：主代理，唯一 Git index 写 owner；本次单一展示责任、共享页面与测试入口，无需子代理交接，直接完成。
- `subdelegation`：不允许继续委派。
- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` checkout、`dev` 分支与该 checkout 实际 Git index；执行前通过 Git 查询 canonical index，独占 index 写入，无 worktree 创建或集成分支。
- `authorizationGate`：当前均为等待计划确认；确认后由 action-authorization 为每个节点核对编辑、生成、验证、stage、commit 最小能力信封，未列出的外部动作不授权。
- `deferralEvidence`：无；资源冲突通过锁处理，不制造额外依赖。
- `failureDomain`：本节点及消费其产物的传递后继；不影响无依赖分支。
- `replanTriggers`：产品语义变化、文件/副作用超范围、工具或生成链证据失真；计划内失败先诊断修正，不降低验证、不盲目重复。
- `resourceLocks`：编辑节点独占其 writeSet 中 canonical 文件；生成节点独占两份 canonical catalog；所有验证对稳定源码只读。Browser runner 独占当前项目测试产物目录，真实验收独占受控无头浏览器 session；stage/commit 独占实际 Git index。Lint 等程序自行产生缓存允许，但不主动清理或提交缓存。

### 节点记录

1. `D-stage`：taskBoundary=文档提交；operationKind=stage；outcome=仅设计、计划、票据进入暂存；estimatedCost=低；hardPredecessors=无；consumes=已确认文档；produces=暂存文档；completionEvidence=staged diff 精确匹配文档 allowlist；readSet/writeSet=本文、票据、设计及 index；stateEffects=暂存；commandScope=只读 Git 核验及精确 `git add --`；verification=无无关文件、无 ignored 文件、diff 检查通过。
2. `D-commit`：taskBoundary=文档提交；operationKind=commit；outcome=文档独立本地提交；estimatedCost=低；hardPredecessors=D-stage，等待已核验暂存内容；consumes=暂存文档；produces=文档 commit；completionEvidence=commit id 与文件清单；readSet=暂存内容；writeSet=本地 Git 元数据；stateEffects=本地提交；commandScope=普通 `git commit` 和只读核验；verification=提交仅含文档。
3. `E`：taskBoundary=任务01；operationKind=编辑；outcome=目录展示、交互和对应测试完成；estimatedCost=中；hardPredecessors=D-commit，等待实施前文档提交；consumes=设计、现有页面、组件文档和测试；produces=源码与测试稳定快照；completionEvidence=完整 diff 与范围核验；readSet=修改边界、组件与测试文档；writeSet=上述页面、可选组件、应用测试；stateEffects=源码编辑；commandScope=原生编辑工具；verification=无业务 owner 改动、无多余控件。
4. `G`：taskBoundary=任务01；operationKind=生成；outcome=双语 catalog 稳定；estimatedCost=低；hardPredecessors=E，等待最终 macro 输入；consumes=源码 macro 和 Lingui 配置；produces=两份 catalog；completionEvidence=完整字段 diff 审查和二次提取稳定；readSet=配置允许的 src 输入；writeSet=两份 catalog；stateEffects=提取及本次翻译补充；commandScope=messages:extract、仅本次翻译内容编辑；verification=上一节生成契约。
5. `F`：taskBoundary=任务01；operationKind=格式化；outcome=最终格式化快照；estimatedCost=低；hardPredecessors=G，等待源码与 catalog 稳定；consumes=本次变更；produces=格式化后的稳定输入；completionEvidence=限定文件 diff 与非 fix 检查；readSet/writeSet=本次变更文件；stateEffects=限定格式化；commandScope=预检后的项目 formatter；verification=无范围外改动。
6. `V1`：taskBoundary=任务01；operationKind=验证；outcome=自动化门禁通过；estimatedCost=中；hardPredecessors=F，等待稳定最终输入；consumes=实现与测试；produces=目标三浏览器及 ci 结果；completionEvidence=实际收集目标且全部通过；readSet=项目验证输入；writeSet=程序自动测试产物和缓存；stateEffects=无头测试、lint 等；commandScope=上述目标 Browser 与 ci；verification=Level 1 与组合门禁。
7. `V2`：taskBoundary=任务01；operationKind=验证；outcome=真实无头验收证据；estimatedCost=中；hardPredecessors=F，等待最终实现；consumes=当前代码对应的真实 GUI；produces=逐场景 Level 2 结果；completionEvidence=代码版本、完整 URL、无头状态和观察记录；readSet=真实新建页面；writeSet=受控浏览器会话临时状态；stateEffects=导航、展开、主题与视口测试；commandScope=核验后的无头浏览器工具，不发送、不主动断连；verification=Level 2 场景。
8. `R`：taskBoundary=任务01；operationKind=审查；outcome=最终组合满足设计；estimatedCost=低；hardPredecessors=V1、V2，等待两条证据分支；consumes=最终 diff、测试与验收结果；produces=完成审查结论；completionEvidence=所有必需场景通过且无范围遗漏；readSet=全部本次变更及证据；writeSet=无；stateEffects=无；commandScope=只读核验；verification=不用单元或 Browser 结果替代真实验收。
9. `T-stage`：taskBoundary=任务01；operationKind=stage；outcome=任务变更精确暂存；estimatedCost=低；hardPredecessors=R，等待完整审查；consumes=通过验证的变更；produces=暂存快照；completionEvidence=staged diff、无无关文件；readSet/writeSet=任务 allowlist 与 index；stateEffects=暂存；commandScope=精确 `git add --`；verification=不含缓存、截图或 ignored 文件。
10. `T-commit`：taskBoundary=任务01；operationKind=commit；outcome=产品任务独立提交；estimatedCost=低；hardPredecessors=T-stage，等待核验过的暂存；consumes=暂存任务；produces=任务 commit；completionEvidence=commit id、文件清单和状态；readSet=暂存内容；writeSet=本地 Git 元数据；stateEffects=本地提交；commandScope=普通 `git commit`；verification=不 amend、不 squash、不操作远程。

## 调度、修正与完成

当前所有执行节点等待确认；确认后的初始 ready set 为 D-stage。关键路径为文档提交、编辑、生成、格式化、较慢验证分支、组合审查、任务提交。F 完成后 V1 与 V2 可以 fan-out，R 为 fan-in；若同一底层浏览器或构建输出存在写冲突，按实际资源锁协调，不用任务编号添加依赖。

本次预计两次本地提交：文档提交与任务01提交。任何已提交内容的后续修正创建新独立提交；不把纯顺序调整混入行为修改，不用临时兼容层让中间节点变绿。

发现计划内失败，定位后修改对应产物，并仅使消费该变化的验证证据失效；必要检查重新通过才可汇合。必需环境确实缺失时，报告具体缺口并继续无依赖工作，不宣称计划完成。

最终以全部产品行为、生成稳定性、适用验证和提交完成为结束条件；执行结果分别汇报 Level 1、Level 2、Level 3 适用性以及实际并行、关键路径、未启动 ready 节点。计划确认前不启动任何实施节点。
