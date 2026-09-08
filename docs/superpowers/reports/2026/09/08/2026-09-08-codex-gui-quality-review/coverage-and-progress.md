# Codex GUI 评审覆盖与执行进度

状态：评审、最终独立审查与计划内文档修正完成；报告进入独立本地提交交付。本文件唯一写 owner 为主代理。

## 基线

- 源码基线：`63762612e56d332f474a5ba3861b22be761f0479`，分支 `dev`。
- T-DOC 提交：`63762612e`，仅设计与计划。
- 基线建立时工作区干净；评审源文件 396 个，逐文件 SHA-256 见下表。
- 未跟踪非 ignore 前端文件：无。已核对项目 .gitignore 及 Git ignored 目录清单；node_modules、dist、.reports、.heroui-docs、.redux-toolkit-docs、test-results、playwright-report、日志和缓存是排除类别。跟踪的生成代码、PO、锁文件与隐藏配置仍纳入清单。
- Git index：`/Users/jiangsheng/cnb/codex/.git/index`，主代理独占。
- 本轮不修改源码或测试；仅写本主题报告。源文件摘要在最终汇总前重新核验。

## 节点和能力信封

用户“确认，开始进行”为执行 grantSource。计划节点门禁激活；能力只覆盖节点声明的只读调查、定向测试、报告编辑、审查和精确本地文档提交。无远程、安装、源码修复、真实环境运行或继续委派能力。

每次下发在对话中记录最小信封与 nodeId；它与计划模板、本文事件记录共同构成完整节点记录。只读结果稳定发布后才能由报告编辑节点消费。子代理无共享进度或 Git index 写权限。

| 节点 | 状态 | 稳定证据 |
| --- | --- | --- |
| D-STAGE / D-COMMIT | 完成 | `63762612e`，2 个文档，staged check 通过 |
| I00 / E00 | 已建立清单 | 文件路径及内容摘要，所有跟踪文件均有唯一主归属 |

## 批次进度

| 批次 | 状态 | 后续 |
| --- | --- | --- |
| B01 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B02 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B03 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B04 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B05 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B06 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B07 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B08 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B09 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B10 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B11 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B12 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |
| B13 | 主审、独立复核与报告修正完成 | 已纳入跨模块及最终汇总 |

## 执行事件

- 文档提交完成后建立固定基线；各批有界调查已就绪。最多同时使用可用代理槽位，未启动节点仅因实际容量或锁等待，不因编号形成依赖。

## 已发布节点与调度事件

下表为本轮实际事件登记，起止先后与具体调用保留于会话工具记录；未伪造未采集的秒级起止时间。各 I 节点通过只读结果（含实际文件列表及关键行号）发布稳定证据，E 节点的稳定产物为对应批报告，A 节点返回引用核验与修改项。

| 批次/节点 | 调查与报告 owner | 独立复核 owner | 结果 |
| --- | --- | --- | --- |
| I/E-B01 | 主代理 | review_plan_dependencies | 通过，修正异常引用行号；X03 继续核对展示措辞 |
| I/E-B02 | b02_connection | review_plan_dependencies | 通过 |
| I/E-B03 | b03_session_lifecycle | b07_transcript_display | 通过，补测试及B06关联 |
| I/E-B04 | b07_transcript_display | b10_turn_control | 通过 |
| I/E-B05 | 主代理 | review_plan_dependencies | 通过，补B06关联及行号 |
| I/E-B06 | b06_transcript_state | b02_connection | 通过，补canonical生命周期证据 |
| I/E-B07 | b07_transcript_display | b02_connection | 通过，补V-01运行记录 |
| I/E-B08 | b03_session_lifecycle | b06_transcript_state | 通过，收窄EditorState缓存措辞 |
| I/E-B09 | b09_queue_delivery | b06_transcript_state | 通过，补V-02运行记录 |
| I/E-B10 | b10_turn_control | b06_transcript_state | 通过，区分主输入和待发送编辑 |
| I/E-B11 | 主代理 | review_plan_dependencies | 通过 |
| I-B13-CONFIG / I-B12及E-B12 | review_plan_dependencies | B12由b09_queue_delivery复核 | 通过 |
| I-B13-UI / I-B13-E2E / E-B13 | b10_turn_control / b02_connection / 主代理 | b10_turn_control | 通过；Surface组件产生.surface，独立复核已撤回无class误判 |

实际并行：初批 B02/B03/B06/B07/B09/B10/B12 的调查互相重叠，主代理同时检查 B01/B05；之后 B04/B08/B13 子节点及已发布报告复核重叠。不同报告 writer 没有写共同文件，未创建worktree。测试由主代理独占runner，V-01与V-02没有同时运行；报告与源码只读调查继续。

动态拆分：B13按UI/config/E2E三条独立证据链调查，再由主代理一个E节点汇总。X01拆为DISPLAY、RPC、STEER三个只读子问题，后两者只消费已核验B02/B09，不人为等待编辑器批；X02与X03消费各自所需稳定批报告。拆分不扩大目标、读写能力或生成物范围。

未立即启动的节点：早期B04/B08/B13因7个子代理槽位已占用等待容量；槽位释放后复用代理立即推进。E/A等待自己所需稳定产物，X等待对应批证据；这些不是ready节点。未发现有效ready节点被批次编号强制串行。测试共享runner锁仅覆盖测试执行窗口。

## 定向验证节点

V节点的grantSource为已确认计划，owner主代理；readSet为下列明确现有测试及其导入，writeSet无主动源码写；stateEffects为测试正常缓存，commandScope为fnm-backed test:unit；subdelegation=false。开始前已核对cwd、fnm pnpm来源、现有依赖/fixture及unit收集配置；执行前后源码摘要一致。两个节点均已释放runner锁。

| 节点 | 本地开始时间 | 目标与结果 | 证据边界 |
| --- | --- | --- | --- |
| V-01 | 2026-09-08 15:43:13 | liveActiveThreadSession.test.ts + subAgentActivityPresentation.test.ts；2文件32测试通过，无类型错误，退出0，1.27秒 | 现有断言锁定当前stale/throw行为，不消除缺陷；准确命令在B03 |
| V-02 | 2026-09-08 15:50:43 | composerQueueRecordIdentityPersistence.test.ts + composerInputQueuePersistence.test.ts + composerCoordinatorPersistence.test.ts；3文件32测试通过，无类型错误，退出0，1.05秒 | 邻近所有权/普通unknown/事务测试，不覆盖新组合；准确命令在B09 |

合计5个不同文件、64测试通过。未执行Browser Mode、E2E、Level 2/3或外部测试；不新增测试，不把缺口隐藏为通过。

## 汇总节点与计划内修正

I-X01-DISPLAY（b06_transcript_state）、I-X01-RPC（review_plan_dependencies）、I-X01-STEER（b09_queue_delivery）、I-X02（b07_transcript_display）、I-X03（b10_turn_control）均已返回，只读能力到期。E-X 与 E-SUM 由主代理完成，产物为 cross-module-review.md 与 00-summary.md。

修正记录：B01 不再声称连接 unavailable 保留当前正文；B06 补 canonical 生命周期；B08 收窄为 EditorState 对象身份缓存；B02 排除当前参数 settings 失败反例并明确显式恢复；B09 区分 snapshot 恢复与在线自愈并补旧 revision 影响；B10 区分移除项不重发与其余条目合法推进。B13 的 .surface 缺失误判经本地 HeroUI 源码反证撤回，保留原断言结构建议。所有修正只改报告，无产品代码修正。

A-FINAL 由未编写汇总及跨模块报告的 b02_connection 完成独立只读核验。其 readSet 为本主题文档与必要源码，writeSet 为空，禁止 Git 写入、测试、安装及继续委派；消费稳定 E-X/E-SUM 与各批报告，返回后能力到期。确认 396 文件、13 批、8 项确定缺陷、3 项维护建议、4 项风险及 64 测试边界一致。

E-FINAL-FIX：按 A-FINAL 明确结果修正 X03-002，补正文已有通用重连 Alert 的 renderer/projection 证据，保留具体原因及恢复入口缺口；同步汇总。B10 的 B03 关联标题改为非发现正文标题，B06/B08/B10 收敛终态措辞。独立审查明确这些文档修正后可通过；主代理逐项回读核验，无需新增调查或测试。

E-CLOSE：最终 SHA-256 核验 396/396 一致，唯一主归属、13 批计数和全部相对/绝对文档链接核验通过；源码相对固定基线 diff 为空。发现正文标题 15 个且编号唯一。新文件逐份内容与空白检查，不以未跟踪文件的空 diff 代替验证。检查脚本首次误将 no-index 的差异退出码 1 当作失败，已核对其空诊断并修正检查逻辑；另次标题计数识别 B10 引用标题，按上述方式收敛。两者均为检查/文档修正，不改产品验证标准。

R-STAGE / R-COMMIT：主代理独占 /Users/jiangsheng/cnb/codex/.git/index，仅暂存 00-summary、13 份 batch、cross-module-review、coverage-and-progress 共 16 个新报告，检查 staged diff 后创建独立本地提交；不包含已提交 design/plan，不 amend、不操作远程。提交身份由包含本文件的 Git 提交记录确定，避免自引用 SHA。全部节点完成后终止，不追加评审或修复轮。

实际关键路径：D-COMMIT → I00/E00 → 会话/队列调查及批报告独立复核 → X01/X02/X03 → E-X/E-SUM → A-FINAL 与文档修正 → E-CLOSE/R 提交。最终无遗留未启动 ready 节点；早期容量等待及复用证据见前文。

## 覆盖清单

| 文件 | 主归属 | 状态 | 基线 SHA-256 |
| --- | --- | --- | --- |
| `codex-gui/.editorconfig` | B13 | 已完成静态主审 | `140a3af47b162217409f8e635fc70d0b01caf0ee81612d8904412366e83a1063` |
| `codex-gui/.gitattributes` | B13 | 已完成静态主审 | `d60f352d0db1404c70afb4bb8b2ca3fd1c610572aa40720e8a0b7baa7885418c` |
| `codex-gui/.gitignore` | B13 | 已完成静态主审 | `0064590424535af8f2124d6497b1b3f390f434b4014be7e2055eadd8f8731af7` |
| `codex-gui/.oxfmtrc.json` | B13 | 已完成静态主审 | `9fd3899b3c81c66b7603948d9b9c296b1afe74565db6cf06d29a54d5aa29eef5` |
| `codex-gui/.oxlintrc.json` | B13 | 已完成静态主审 | `393bce0b9c6294878e08051716503039e30f328d4c1b54bed8d290f927d1fff4` |
| `codex-gui/.prettierignore` | B13 | 已完成静态主审 | `1f6d26694823ec0520a634c8cba368b080e07dcd98297743b7e057d481875f80` |
| `codex-gui/.prettierrc` | B13 | 已完成静态主审 | `ac5868af5fec64d1f0285340fd1b9f3536e387a9bd626d9e87ff6fb1098905b1` |
| `codex-gui/AGENTS.md` | B13 | 已完成静态主审 | `acff7f2050444f2113d7bbcf8b75ce8094f5752bf183dc74d3bb06e393e34fd1` |
| `codex-gui/README.md` | B13 | 已完成静态主审 | `9383d43a7415378a7b63725e36e6ccdc52bbcd0f6b98643778b1a7a943d2da08` |
| `codex-gui/e2e/app.spec.ts` | B13 | 已完成静态主审 | `1d89cff2dcfd11988f5529b48e9d938566696095f7768673b2c0bed8081ee1ff` |
| `codex-gui/e2e/multiSession.spec.ts` | B13 | 已完成静态主审 | `930b83c6cfd381faa85b776334d8049105b4e5d8899e5ba42470495858267b81` |
| `codex-gui/e2e/multiSessionHarness.ts` | B13 | 已完成静态主审 | `a7ad5b2c18772898b3adea77c3d024723e6bf1a650f903bd31895299d91d57cd` |
| `codex-gui/e2e/newSession.spec.ts` | B13 | 已完成静态主审 | `98cb9b1497b5a242bb6a8ab44db2e3b2e5f853e4e5eb3d55451eb0578aece48b` |
| `codex-gui/e2e/newSessionHarness.ts` | B13 | 已完成静态主审 | `c1da6614cec0bbb03a90b3c97e9e9b2f62f6e2ba00de12870b7a73d1c2931c86` |
| `codex-gui/e2e/persistence.spec.ts` | B13 | 已完成静态主审 | `a43e50fd3f8e859f47da6790b8cce22ce9c0182329a8c4dee2b1a12b45d86abb` |
| `codex-gui/e2e/persistenceHarness.ts` | B13 | 已完成静态主审 | `013d2d2e8ad94a11f7614f23f2c13b870342ae47093cb83c744e2b356772994e` |
| `codex-gui/e2e/tsconfig.json` | B13 | 已完成静态主审 | `18c910fcfbe1a6e29fc5cebbea96a64f32b17835cbba5715c09103ccf158ed7f` |
| `codex-gui/eslint.config.ts` | B13 | 已完成静态主审 | `a4856a9487f2c69f4c144db66bcae3b4b2a234603c8ad2726833d6133f2a8e9b` |
| `codex-gui/index.html` | B13 | 已完成静态主审 | `37f61e03d0090b9117e294ca5f52de75f897ede3a99f86009a8fe12b39d76fe1` |
| `codex-gui/lingui.config.ts` | B13 | 已完成静态主审 | `a54ea863193d7ee01832c1465213b75a95f10d14faa57b8b46cd9534550dab32` |
| `codex-gui/package.json` | B13 | 已完成静态主审 | `549067320f57abf0b1ec83369afc7560060e0a0ca4b9095c7cb5805047559bc3` |
| `codex-gui/playwright.config.ts` | B13 | 已完成静态主审 | `f3388e7a3e88ad5424eeb435efef60aa1a6f765b9276ff7fee57971b56489941` |
| `codex-gui/pnpm-lock.yaml` | B13 | 已检查依赖声明与解析 | `091623b5e8ebe9694e3b1ae8c28ed4285d763d30c8e006c62a52d4f2353d29b1` |
| `codex-gui/pnpm-workspace.yaml` | B13 | 已完成静态主审 | `2b86d78f7a82c272f5ca9b9fea7ca97345a0f86e8b7e04c488ef4ef933cde5f9` |
| `codex-gui/public/favicon.svg` | B11 | 已完成静态主审 | `61bc9a161de58248288e6905425d7180f0624c2865007b97d763fdac12043a66` |
| `codex-gui/scripts/clean-test-artifacts/cli.ts` | B13 | 已完成静态主审 | `69bf0f798db024e390b364b9538854a73cf745d3130f533155d84dec28105237` |
| `codex-gui/scripts/clean-test-artifacts/core.test.ts` | B13 | 已完成静态主审 | `3384f91ab25b917dd020d26b90a191c00ca964045d04209f2274a786c6a2b640` |
| `codex-gui/scripts/clean-test-artifacts/core.ts` | B13 | 已完成静态主审 | `93fe89858afc88f4c9c86465862c122b499562ef0ad9e57671e9febbb2d4f7bf` |
| `codex-gui/scripts/large-files/cli.ts` | B13 | 已完成静态主审 | `c84fa88aaf89b7644581aa916cc36756e367ab350be0e3afbaab1ceb7b296200` |
| `codex-gui/scripts/large-files/core.test.ts` | B13 | 已完成静态主审 | `78b6c258fab980816f520f6a2ebe1183b2f94658e72a4ab078d33894fade6117` |
| `codex-gui/scripts/large-files/core.ts` | B13 | 已完成静态主审 | `7b0660e62e8b862371c4751dc958e3300860e4ab84ef2650e9c1bff28ca0a754` |
| `codex-gui/scripts/protocolValidators/cli.test.ts` | B12 | 已完成静态主审 | `297af7aeb44a22b33296b770f1a069a339ebe78433a7d6197c86d7863421cdc1` |
| `codex-gui/scripts/protocolValidators/cli.ts` | B12 | 已完成静态主审 | `499ed2cd2aa3f57f73293ed78718e5b8c0aa75183c5ef2ee89c36ef50e46dc8d` |
| `codex-gui/scripts/protocolValidators/core.ts` | B12 | 已完成静态主审 | `f64de0476121c18effe5a1e0d26d0c2e7768cb0e98ed4855559cc79c08f89a00` |
| `codex-gui/scripts/protocolValidators/coreAppServerArtifacts.test.ts` | B12 | 已完成静态主审 | `bfb9dda3be06c4669c506aa68e1c5f91ee07ff5ea0f684b22300e1c49d24ccfd` |
| `codex-gui/scripts/protocolValidators/coreGuiHostArtifacts.test.ts` | B12 | 已完成静态主审 | `16d342b3e8c5d0e4addc2e367d90970dda45eef838f215111f276cd760ace26b` |
| `codex-gui/scripts/protocolValidators/coreInputSelection.test.ts` | B12 | 已完成静态主审 | `e91548837aff6fb1c5075d2e7192d951c50a27860ddd38431f921db5403ac752` |
| `codex-gui/scripts/protocolValidators/coreTestSupport.ts` | B12 | 已完成静态主审 | `0530e612e80ae63c829e6a76fcf7905b951bf7f3c5779508c719a326204ae7ad` |
| `codex-gui/scripts/protocolValidators/standaloneValidatorArtifacts.ts` | B12 | 已完成静态主审 | `6a6cc90f4a248230cfad45bf8135978428450fe1fbd8be717663a91ad40b9406` |
| `codex-gui/scripts/protocolValidators/typescriptArtifacts.ts` | B12 | 已完成静态主审 | `c33c978aac12c56055e22903be082f5c4cd552672aa9b880e193a8e2ccf1e912` |
| `codex-gui/src/App.tsx` | B01 | 已完成静态主审 | `eefcf603e29999e8dd328e551121eb2d90b3f3aaa799f1ca03e83fc2e1ce59d7` |
| `codex-gui/src/NotFoundPage.tsx` | B01 | 已完成静态主审 | `b12850ab63a9a493ae85b5f4838ff3192774418a84f3797cdbaa6a39ef628ebd` |
| `codex-gui/src/__tests__/AppActiveThreadSession.browser.test.tsx` | B13 | 已完成静态主审 | `90e23003f456588caf50d613e19b854246366a6fe9b4c6436541ac80e8a30049` |
| `codex-gui/src/__tests__/AppComposerQueueInterrupt.browser.test.tsx` | B13 | 已完成静态主审 | `79508d53528dd5be8b59006041f802b20ca0cbb4e38a4af3653fe9b58ef036ba` |
| `codex-gui/src/__tests__/AppComposerQueueOrdinary.browser.test.tsx` | B13 | 已完成静态主审 | `8054a5f872bc08719e7afc7c7e8d4543fd270ffcd7a10f31a9ac8b6d822a437f` |
| `codex-gui/src/__tests__/AppComposerQueueSteer.browser.test.tsx` | B13 | 已完成静态主审 | `ce9b3dbf94ccb5424424411ff6cb9b0c5e8409e2aa36afce0f580cfa13db9683` |
| `codex-gui/src/__tests__/AppErrorPresentation.browser.test.tsx` | B13 | 已完成静态主审 | `f82c262c72e897eb576bd74bcd759f588d3e586089e871f15e0b72f5519f6a13` |
| `codex-gui/src/__tests__/AppMultiSessionIsolation.browser.test.tsx` | B13 | 已完成静态主审 | `fb02532e97e32a3e9c98187b0e5989e64a03575acbe8b8aebbe63461e2d6858b` |
| `codex-gui/src/__tests__/AppNewSession.browser.test.tsx` | B13 | 已完成静态主审 | `fb2b486dc828996c2584414ca45b72a6b28e94be8e7dbd6f1ea7559fb21fda2d` |
| `codex-gui/src/__tests__/AppProjectionAvailability.browser.test.tsx` | B13 | 已完成静态主审 | `578ed36abec7eb3ef6fecc315d04cbc4112020749e133c129a3d4e479f455299` |
| `codex-gui/src/__tests__/AppProjectionIngress.browser.test.tsx` | B13 | 已完成静态主审 | `8a39efa60db0e7c0357177a4943da7fd573c564dd3b8489421f1e5a1ad6b35f4` |
| `codex-gui/src/__tests__/AppProjectionScroll.browser.test.tsx` | B13 | 已完成静态主审 | `3868308fac20f0aa44fcc6d550aa70e43f9e0b02705064479b2fdcd12cee9a9d` |
| `codex-gui/src/__tests__/AppRouting.browser.test.tsx` | B13 | 已完成静态主审 | `d8f09df8c5e16b4e4594dba40519e2460c0a6ddac31f94459a9c02f073c1a0dc` |
| `codex-gui/src/__tests__/AppSessionCompaction.browser.test.tsx` | B13 | 已完成静态主审 | `434e4cf912aef93c616723ab2821293ebaf9ed49032d523112f3abbfbb7d5668` |
| `codex-gui/src/__tests__/AppShell.browser.test.tsx` | B13 | 已完成静态主审 | `9a861464ffa46f7ff2ef36389c0eb927f9a384212a3444f5b8bff17295daffc3` |
| `codex-gui/src/__tests__/HistoryPreviewChatLayout.browser.test.tsx` | B13 | 已完成静态主审 | `d66cdcc44f855f359c12fa321567d9a20bdd28dd3f0079dbb3b4d2d1ab7d6e39` |
| `codex-gui/src/__tests__/NotFoundPage.browser.test.tsx` | B13 | 已完成静态主审 | `5651d4f4a5d85f9fd3d661ce14543a1a6244f9b0fc0ebbc4c0c92dc25e38873e` |
| `codex-gui/src/__tests__/appBrowserRenderHarness.tsx` | B13 | 已完成静态主审 | `53fa0e47d2605f63f6d96c292d90fa4abe3c31e31d8d73ba1339beaf984cd945` |
| `codex-gui/src/__tests__/appBrowserTestSupport.ts` | B13 | 已完成静态主审 | `e4b88d8f7d834efe96bcf8eb4df8c66743e35d609f2f8e19f292c4b0166500e8` |
| `codex-gui/src/__tests__/appComposerQueueBrowserTestSupport.tsx` | B13 | 已完成静态主审 | `4f40646f08b6d9adaf21e01d56d208d3525b0c56c74bf32e58751579806b4276` |
| `codex-gui/src/__tests__/i18n.browser.test.tsx` | B13 | 已完成静态主审 | `2d84663fb8edab2e22704004adcc3cd71182673418a36e51d2234df5165e0ad2` |
| `codex-gui/src/__tests__/i18n.test.ts` | B13 | 已完成静态主审 | `765c2dedef9eefd26b1252a95c652c39abddec362974201a3e488f8b27bdd286` |
| `codex-gui/src/__tests__/sequential/composer-focus.browser.test.tsx` | B13 | 已完成静态主审 | `123c17fc188d77ca1387f8090b489ba13e87f43e1270d4b60ae67fd8e33e08e5` |
| `codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx` | B13 | 已完成静态主审 | `f1ed7459573f413a8151568a253162841ff2e5d979b151bb4246459979f6ca72` |
| `codex-gui/src/__tests__/sequential/composerClipboard.browser.test.tsx` | B13 | 已完成静态主审 | `3f18e0b3b58b18e3814a33f9cae387f2e287f778497f62d92663dc17287f7bcd` |
| `codex-gui/src/__tests__/sequential/history-focus.browser.test.tsx` | B13 | 已完成静态主审 | `17c900c69b369c4e5dde8449d6a5f0ccd0365c7808c2a1dd6d76e2cb157f7d1d` |
| `codex-gui/src/__tests__/sequential/navigation-focus.browser.test.tsx` | B13 | 已完成静态主审 | `0a2d798b0e9ed3e7951555cb5046d91ded257d7013e690f66acbb39fec206502` |
| `codex-gui/src/__tests__/sequential/pagination-focus.browser.test.tsx` | B13 | 已完成静态主审 | `8f21e01d0da674ac2eead0cb6d692e22fcf3300f45cff2a1e99fe8a610261e0b` |
| `codex-gui/src/__tests__/sequential/subagent-activity-responsive.browser.test.tsx` | B13 | 已完成静态主审 | `ad5715d3ae8b3f85254e87a870c24c2c722ce69765a3b19752703d02dc8030e5` |
| `codex-gui/src/__tests__/smoke/AppComposerQueue.smoke.browser.test.tsx` | B13 | 已完成静态主审 | `3f0be0746b2344a4e6f08e8b1501bfc6a438b34a1bb2891cf6503960d5b4d3f0` |
| `codex-gui/src/__tests__/smoke/AppRouting.smoke.browser.test.tsx` | B13 | 已完成静态主审 | `9e94d06dea75e35ed58ed768f0c6392fd86b5a61b8fe7824375da7e46bf90ae7` |
| `codex-gui/src/__tests__/smoke/AppThreadSwitch.smoke.browser.test.tsx` | B13 | 已完成静态主审 | `a1b1b3497a9cbcd4e57277108b4f8d091f769e2efffcd4ebc240518ef6820d84` |
| `codex-gui/src/__tests__/testDeferred.ts` | B13 | 已完成静态主审 | `6ed5f9456acb096ff7257fe39d9d4701f77fcc7019e2eb127005be904b7075ba` |
| `codex-gui/src/__tests__/viteDevCompression.test.ts` | B13 | 已完成静态主审 | `3b0372d2524536bb0d68e756eb94368f95df63858c1d5c1eb4d97c5b91f1c484` |
| `codex-gui/src/app/ThemeProvider.tsx` | B01 | 已完成静态主审 | `8317f5e71776a7d76ba0eee144282581895d58d7ecd61fac808c9be7109557ee` |
| `codex-gui/src/app/createAppSlice.ts` | B01 | 已完成静态主审 | `2e70d5714f32e02dcc817b5911927a76dd559ea00a22893e33f6ef5c49b04b3e` |
| `codex-gui/src/app/hooks.ts` | B01 | 已完成静态主审 | `e75a5566412603fc82471150813737a8b0f7f5f4fd059045eeae6feebcf13f1c` |
| `codex-gui/src/app/store.ts` | B01 | 已完成静态主审 | `b9d5ea70bc124f6c26fe11b62de09a0fdf8ec8e3c7c04d412048b71f0162874c` |
| `codex-gui/src/features/activeThreadSession/__tests__/activeThreadCompaction.test.ts` | B03 | 已完成静态主审 | `b09e035438b8108594c951c7a3fb6249bb63d4f6de0715ef180ab70a4d033426` |
| `codex-gui/src/features/activeThreadSession/__tests__/activeThreadMemberLifecycle.test.ts` | B03 | 已完成静态主审 | `732c29af0289385d8728452ef128e05dd46d5eded5688a9ec892b04fa6fbad19` |
| `codex-gui/src/features/activeThreadSession/__tests__/activeThreadProjection.test.ts` | B03 | 已完成静态主审 | `028ebaec6fd12d3bd9ced9c48257c2f29362f2a02e762692c47cca07dafabf5b` |
| `codex-gui/src/features/activeThreadSession/__tests__/activeThreadSession.test.ts` | B03 | 已完成静态主审 | `8582bc4808a375f803ea58549d4b0eda717c88b00a03db6c854037f26dcc2132` |
| `codex-gui/src/features/activeThreadSession/__tests__/activeThreadSessionHarness.ts` | B03 | 已完成静态主审 | `0246576cbab4c4e2acd5b602f5bc1c166d2485bbbe006962ab93114fe74da232` |
| `codex-gui/src/features/activeThreadSession/__tests__/activeThreadSessionIdentity.test.ts` | B03 | 已完成静态主审 | `ea12e95c92eec82d640ffa7d4f425df362cdd912f413e0784d8078d12aa69973` |
| `codex-gui/src/features/activeThreadSession/__tests__/activeThreadStatus.test.ts` | B03 | 已完成静态主审 | `53dab5d9b0d63ab6cb630f67cf6e977ca950d72ce0ac9cceb5c8ca8ce1c3e4c3` |
| `codex-gui/src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts` | B03 | 已完成静态主审 | `190a007b3d5ac2c6c18b32522e4b9cec9f160a568f224468817c9b80fb21872e` |
| `codex-gui/src/features/activeThreadSession/activeThreadCompaction.ts` | B03 | 已完成静态主审 | `a5fd4ad7062a2a8c48d6c9c3a84a9caf7f592d2da1023c2066f2492a9ec7a419` |
| `codex-gui/src/features/activeThreadSession/activeThreadMemberLifecycle.ts` | B03 | 已完成静态主审 | `7918a800167b262479dfbffadc7ed73881d65350b166c3964de759f601ff9b75` |
| `codex-gui/src/features/activeThreadSession/activeThreadProjection.ts` | B03 | 已完成静态主审 | `11452609df3667c8b9253585712c0405be6211c4a19887418294c9f686bd06ea` |
| `codex-gui/src/features/activeThreadSession/activeThreadProjectionFacts.ts` | B03 | 已完成静态主审 | `0b3facab9543336fa82ee8cb5056a817ed54928167a59e80868de5457250c24c` |
| `codex-gui/src/features/activeThreadSession/activeThreadProjectionReplay.ts` | B03 | 已完成静态主审 | `7a84568f1c15f6433406f5a72322c5861f755739989dd10cd01eadd08090903f` |
| `codex-gui/src/features/activeThreadSession/activeThreadSession.ts` | B03 | 已完成静态主审 | `a62c0d9afc617e82a64f277f6d3aeda1597a80ef5fdfc03ab37feeb986176279` |
| `codex-gui/src/features/activeThreadSession/activeThreadSessionCollectionContracts.ts` | B03 | 已完成静态主审 | `52de1247926286af7d42f046f3ea8ff1e136f1fccb40648cd27b43ed0188782c` |
| `codex-gui/src/features/activeThreadSession/activeThreadSessionContracts.ts` | B03 | 已完成静态主审 | `465ddba24710416cf78f91cd51824bdfd0ae9e7bbd90db4086d66142a77b0371` |
| `codex-gui/src/features/activeThreadSession/activeThreadSessionIdentity.ts` | B03 | 已完成静态主审 | `4cf6facf1e0b2ef9febfaf7e36d792a439dc69444bd614f55167c90b935e6dd2` |
| `codex-gui/src/features/activeThreadSession/activeThreadSessionReadModel.ts` | B03 | 已完成静态主审 | `f08ad316666ee4fd916a4b635770973308e4a97850b83ee4572361d387072843` |
| `codex-gui/src/features/activeThreadSession/activeThreadStatus.ts` | B03 | 已完成静态主审 | `1d2b50ec71d33a8a77dcf79cf8568bc31c0f2ecb9fd19f5efe7f8855af33cace` |
| `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts` | B03 | 已完成静态主审 | `d462fdbbf098f42b2f7b7b7a042e744dd127211696ddab4de8af1cd8a30f2332` |
| `codex-gui/src/features/appShell/ActiveThreadCollectionMenu.tsx` | B01 | 已完成静态主审 | `d2e95070c7933fb64c0c4a387c439b0cb1b73f1c02dfd992bc7e79f8e77de646` |
| `codex-gui/src/features/appShell/AppCapabilities.ts` | B01 | 已完成静态主审 | `ffe1dd8bab24d29e4c3de4de78cd3c4054d7f16dbf124895159348207525b783` |
| `codex-gui/src/features/appShell/AppCapabilitiesContext.tsx` | B01 | 已完成静态主审 | `da5cb66ad3048dc30730b269945e64185574de7545ba9751ddfc7365188b4991` |
| `codex-gui/src/features/appShell/AppShell.tsx` | B01 | 已完成静态主审 | `b53d4d0b39591011251c98be05b5c949f4528b63be78bd3c15a4c40886fe3ad6` |
| `codex-gui/src/features/appShell/AppShellTopBar.tsx` | B01 | 已完成静态主审 | `3e11a57dbc75c6e15e54900f33d693288cf651a9bc36442e97899e13e9d50879` |
| `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx` | B01 | 已完成静态主审 | `70c4b3d8b224e82e03265a0accf87a3518d35445c86e111b8f1983216061a247` |
| `codex-gui/src/features/appShell/__tests__/ActiveThreadCollectionMenu.browser.test.tsx` | B01 | 已完成静态主审 | `00e4f82bcae59cc2711db88b79a83aebbaf35a46fd6e842ef06ac08c318382e3` |
| `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx` | B01 | 已完成静态主审 | `2e1796ddf4c47cc0fe8c64581b1d916e73bfc9eb30391a59692ee6f8b419bfd2` |
| `codex-gui/src/features/appShell/__tests__/activeThreadCollectionPresentation.test.ts` | B01 | 已完成静态主审 | `3f6ed87ec4614c117a233d2239e1a194f142ebddc1fc48bbe0ed924fe7359c93` |
| `codex-gui/src/features/appShell/__tests__/appShellTopBarBrowserTestSupport.tsx` | B01 | 已完成静态主审 | `58ed4939ff6d0b75ae89ddbc614a745f778e8bdbf466116c4d5ca46bf923f5de` |
| `codex-gui/src/features/appShell/__tests__/guiHostConnectionLifecycle.test.ts` | B01 | 已完成静态主审 | `f0a539bcc533c6e4777761cc24dac96d44c1f68136f5a8baeeac5a2e8453bb61` |
| `codex-gui/src/features/appShell/activeThreadCollectionMessages.ts` | B01 | 已完成静态主审 | `261fa64c24aba320729017b77a959fb77f5e72e01c74d740d7f82fb5f7c54edd` |
| `codex-gui/src/features/appShell/activeThreadCollectionPresentation.ts` | B01 | 已完成静态主审 | `2a222f1c03a8b1731e0596882a8f9fc850537646c0acd41bbf747360e56d0e83` |
| `codex-gui/src/features/appShell/guiHostConnectionLifecycle.ts` | B01 | 已完成静态主审 | `4181b2c0221ff93af74ff2cd436664930d53514e4ee235771c3833712ab5cee7` |
| `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts` | B01 | 已完成静态主审 | `571b0510bc2065cfbdf842eadc79117d40ddc24f34792222014302bd103ce652` |
| `codex-gui/src/features/browserLaunch/__tests__/browserAuthorizationSession.test.ts` | B02 | 已完成静态主审 | `91a072dce18c9968ac10772ff8ff7f88b1c0f3c9430b11b83d12ae04bb3ddfae` |
| `codex-gui/src/features/browserLaunch/__tests__/guiRouteTarget.test.ts` | B02 | 已完成静态主审 | `91ff369e3c8649785d3918caacf3b140148685b3bd844b37b1c1339d3e973762` |
| `codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts` | B02 | 已完成静态主审 | `88fbf56b918c83d03341337fd31f9926e0209234990ce962473f23f6351cb6a7` |
| `codex-gui/src/features/browserLaunch/guiRouteTarget.ts` | B02 | 已完成静态主审 | `dcd108c06a24ad5dac97cb4b2fba318fc8cc946fa2184c613e08516d2e022e66` |
| `codex-gui/src/features/browserPersistence/__tests__/browserPersistenceStore.test.ts` | B03 | 已完成静态主审 | `f261c53ccb845a17d7ff29e7f054cb1608d539c1f1b92de6d815e7a29d6666ee` |
| `codex-gui/src/features/browserPersistence/browserPersistenceStore.ts` | B03 | 已完成静态主审 | `bccb6a098143f6bcc646026ed1b87bd431c4c2d30e171336cb4ce33119e341d1` |
| `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx` | B07 | 已完成静态主审 | `19d7a02b7b4e43c17c46d4277a5c188549373fc5d6f6caa19455a6da64bec0c8` |
| `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurfaceRenderer.tsx` | B07 | 已完成静态主审 | `bfa9d6c5fd9650aaaca57c0cddf4082e9590dc74a4d25de866d9c0e5ec5914d5` |
| `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptTurnFragment.tsx` | B07 | 已完成静态主审 | `900659e7f42bce90fd2ab661abaf5a4c864a74eca287c63947b338ff88e48abb` |
| `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx` | B07 | 已完成静态主审 | `5c5100d06da72ed69f2b96a3ef34b9801215059701ecd7b7ca4b91e13167b70e` |
| `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx` | B07 | 已完成静态主审 | `65f99c180a5e0ac247dd10883e6f4fb0c51773d392cc1c0fe97143137fe96727` |
| `codex-gui/src/features/committedTranscriptSurface/TranscriptActivityEntries.tsx` | B07 | 已完成静态主审 | `cb1aeafac41a89a9ece3aab354b1deac4c4cf26c35f9bd9e0ecef6bf2803b626` |
| `codex-gui/src/features/committedTranscriptSurface/TranscriptContextBoundary.tsx` | B07 | 已完成静态主审 | `56d91d9fb96ff40560d0a548ca9c47b5913412bfc19b14819f63671b4e39df87` |
| `codex-gui/src/features/committedTranscriptSurface/TranscriptContextPagination.tsx` | B07 | 已完成静态主审 | `d2e4db4b1425bc21b5cdc2979206c6c14ce9dbd66c95de26b0b9b0e3d4de98dc` |
| `codex-gui/src/features/committedTranscriptSurface/TranscriptEntryRenderer.tsx` | B07 | 已完成静态主审 | `27760ab9d4bd3260f7981703cda064b2dadee4afd85e0f2d0b3918ffa7074255` |
| `codex-gui/src/features/committedTranscriptSurface/TranscriptReadContext.ts` | B07 | 已完成静态主审 | `61bf40599ae5345c1f6920f53c2b2469d74269b639b40edabba2731c1c9032a6` |
| `codex-gui/src/features/committedTranscriptSurface/TranscriptReadProvider.tsx` | B07 | 已完成静态主审 | `3e1b3f38ce8eadeb38af39846e14cd0d84acc3e4bcffbd400c786282f2cbfc00` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceActivity.browser.test.tsx` | B07 | 已完成静态主审 | `cc25ca423e7bb2232fdc15d236726717577f42589935a19117954dee5abd639f` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceDisclosure.browser.test.tsx` | B07 | 已完成静态主审 | `c1d8eef40e01c3aca4c3c99de74ccafbb9eff5b2e722e9acef1a6344bfa08919` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceMessages.browser.test.tsx` | B07 | 已完成静态主审 | `9f700b4dc951a63bc94f1998b3467531a1487b032c9eaeae9844e5406d17632a` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceSessions.browser.test.tsx` | B07 | 已完成静态主审 | `b5246e47d12b49f1d8902f87c25ee27ea412bd7779cd87b9f2c8fd1b5eb4312c` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx` | B07 | 已完成静态主审 | `e9ff29910bed12ce7aaa4c6db076794ad4cde3c9522c8aff69257d53db742bdf` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx` | B07 | 已完成静态主审 | `792f150cc4502eb168b5bb2919ffeab21ed431c6d807b9e7fb04bf8c13656f5a` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx` | B07 | 已完成静态主审 | `425a8a4d615d5c43fa342a240eb67ec90d0af285bbd909c21f523295b6bebe06` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx` | B07 | 已完成静态主审 | `0338915d47b79320e063eb1919d53070281093d6423f3173db675899e2cb5581` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx` | B07 | 已完成静态主审 | `d5a62c4546628272c1ea2a483eaaccc6434a559cde85d632bae532c62b197069` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx` | B07 | 已完成静态主审 | `21a0409b4c0ab15c99275cebb952ee973f5f09d548c77dbdb3b37a68d7a29d38` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/subAgentActivityPresentation.test.ts` | B07 | 已完成静态主审 | `74449bd518c15a6e00875f62f16990c69f02e74b67f66faba3fde2e37e05a339` |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/transcriptSurfaceFixtures.tsx` | B07 | 已完成静态主审 | `e5e9c9f79c584d7f8d98d2bcdfb7d984a4ac6f5f24ab45dea6e5e65a44382622` |
| `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx` | B07 | 已完成静态主审 | `dcfb702a518717cc8fed4376a08e14a3be88c20e658969dcdf0bf51c953fa5e8` |
| `codex-gui/src/features/committedTranscriptSurface/subAgentActivityPresentation.ts` | B07 | 已完成静态主审 | `aae8ebb643775b4ecbab351d734a8f6897aade2a0e44c0426c2bb187ea61561a` |
| `codex-gui/src/features/composerEditor/ComposerAtomicNodePlugin.tsx` | B08 | 已完成静态主审 | `f5d1753131792c2b99e67675361aec2cf7cf116ab3d5d2b9bea3a8359a98aa77` |
| `codex-gui/src/features/composerEditor/ComposerClipboardPlugin.tsx` | B08 | 已完成静态主审 | `ef4278573ce03e5e2954b4434ef9d8d18169a2880df19861b6160fee64736be5` |
| `codex-gui/src/features/composerEditor/ComposerContentModelPlugin.tsx` | B08 | 已完成静态主审 | `8441d70478ae9a9e64fd15076412995d2a1c3714603e20241793a983389fa70f` |
| `codex-gui/src/features/composerEditor/ComposerEditor.tsx` | B08 | 已完成静态主审 | `197e212a4fbba5b2ff060d48c1338ce7bf2ad6cd4025083cb752c70c75c4c96a` |
| `codex-gui/src/features/composerEditor/SelectedSkillToken.tsx` | B08 | 已完成静态主审 | `e5e3e5576fb87928b238629cb8022866933bf5a7f12a0803b6786ec5d990cec6` |
| `codex-gui/src/features/composerEditor/SkillNode.ts` | B08 | 已完成静态主审 | `24be7e10246db1ac21cf390fd24acb2aa4861d164f35d8b94a02b99c1d1ad764` |
| `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx` | B08 | 已完成静态主审 | `8589b2c5dbc2ed748f57e51fc27a5bb21df456ed5b2c5e43bb61fb85160efe8c` |
| `codex-gui/src/features/composerEditor/__tests__/ComposerAtomicNodePlugin.browser.test.tsx` | B08 | 已完成静态主审 | `98a0a09b3c79a90b0074c0fa24a00c734f6e0e7721ff0ab5b537f7d8330446c3` |
| `codex-gui/src/features/composerEditor/__tests__/ComposerContentModelPlugin.browser.test.tsx` | B08 | 已完成静态主审 | `0a1d19ee39974adf22f843d38355279485daf23fb21a89e3ece468b8bfa7b56f` |
| `codex-gui/src/features/composerEditor/__tests__/ComposerEditorLifecycle.browser.test.tsx` | B08 | 已完成静态主审 | `28ffc3ad0ca315bbffc6ac4c74362f08de4c7bc1d681cf41ab8103d053ed663c` |
| `codex-gui/src/features/composerEditor/__tests__/ComposerEditorSkillTokenEditing.browser.test.tsx` | B08 | 已完成静态主审 | `9605dbd27839a4e4c08b0433d26eacd523886828618c9fcda0dbdac87757bd2d` |
| `codex-gui/src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx` | B08 | 已完成静态主审 | `bac0d0029b8c9247f84374927a29abbff5ee8806803321915f4f9d3238976bc4` |
| `codex-gui/src/features/composerEditor/__tests__/ComposerEditorTypeaheadMenu.browser.test.tsx` | B08 | 已完成静态主审 | `ed1b1f7a8c0c52c551d9d693862c9a74b8e1e32081700f4836ec126d0d5f7fec` |
| `codex-gui/src/features/composerEditor/__tests__/ComposerEditorTypeaheadSelection.browser.test.tsx` | B08 | 已完成静态主审 | `e3f16906132a492a3e846d76488cc304b0bb8cbfae1776c1d9eef5f3cc3ab44d` |
| `codex-gui/src/features/composerEditor/__tests__/SkillNode.test.ts` | B08 | 已完成静态主审 | `42584f78389250416f29dbade0522221d03c5a45610945e686e43d8915a7b906` |
| `codex-gui/src/features/composerEditor/__tests__/composerDraft.test.ts` | B08 | 已完成静态主审 | `719acc8741cd2a89e65774b340b455017541607bc1613cce6802aa55f2968b55` |
| `codex-gui/src/features/composerEditor/__tests__/composerEditorBrowserTestFixture.tsx` | B08 | 已完成静态主审 | `dc3f1caf8329c661973ca3a510d8a5cb310c80fd2e83849417066bb0e04bef9d` |
| `codex-gui/src/features/composerEditor/__tests__/composerEditorBrowserTestSupport.ts` | B08 | 已完成静态主审 | `1d23da32b7747c4c7aa6abbe4624de08eed07942351805f7b302f03f4b9bf4a6` |
| `codex-gui/src/features/composerEditor/__tests__/composerEditorCompositionBrowserTestSupport.ts` | B08 | 已完成静态主审 | `124b43f8ee943b17af6a6d7a33250edcb1329330d46baa7ff50ab9c24237837a` |
| `codex-gui/src/features/composerEditor/__tests__/selectedSkillPresentation.test.ts` | B08 | 已完成静态主审 | `15b88b1ae030c5ecd30ffc88aa9f8d308d9c7ada640888f6283588c9a3ae5d1d` |
| `codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts` | B08 | 已完成静态主审 | `a434af86f09eb40a0cee77ea03c78095259bfe1502c2231ae344749dff7e8936` |
| `codex-gui/src/features/composerEditor/composerDraft.ts` | B08 | 已完成静态主审 | `0bec46856d5e9c2e1cb0fa878c209884f075441d2e347045fd1e61c0bd0f8df7` |
| `codex-gui/src/features/composerEditor/composerEditorContracts.ts` | B08 | 已完成静态主审 | `9623061975c61bdf854691abaaa83a7a8962d83fc6907e6024f22ab1c6461f0c` |
| `codex-gui/src/features/composerEditor/composerShortcuts.ts` | B08 | 已完成静态主审 | `b047632d4200626394285dbe7341e6c04b07263aa53d5d5c69c645cea77ffd68` |
| `codex-gui/src/features/composerEditor/selectedSkillPresentation.ts` | B08 | 已完成静态主审 | `02eda2d649a1a362c96e77d303331df964e2a9fa35b48962fa078cbdfde51433` |
| `codex-gui/src/features/composerEditor/skillQuery.ts` | B08 | 已完成静态主审 | `8fd29c14e27ad1588a690ff809b260ee41ae5af6c95ab1ab3b36edf09d9c6756` |
| `codex-gui/src/features/composerInput/composerInputPayload.ts` | B08 | 已完成静态主审 | `48d921e49ec8b73fafaa55ac8b0f4dbff27fa36cde98eea47d5fbf232faa13d2` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerCoordinatorPersistence.test.ts` | B09 | 已完成静态主审 | `d4e5c54000b0077408a0d9aa0194f8123e7762fc284a850b32257193a53e67ec` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerCoordinatorRecordCodec.test.ts` | B09 | 已完成静态主审 | `96ce92b1998e8fbd6d433ff166c9c0b3fc3b3e460c9ea3468849d37dba264857` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputPreview.test.ts` | B09 | 已完成静态主审 | `f8acbe3c9c560839224756b08e281b33f3f0779080732388fadd9185f15a85a3` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorInterruptDelivery.test.ts` | B09 | 已完成静态主审 | `6931df566d56d2a9212eea814cfd08e1b69481847ca2599bb86cd19043b4f7d8` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementLifecycle.test.ts` | B09 | 已完成静态主审 | `f4c6e7dcc63b02ff8d631a3244e4fe5a7b7845c0cb47595dd26d1ee5db63001e` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementRecovery.test.ts` | B09 | 已完成静态主审 | `2c3ec9552aa6a46ac0f14f10a4223f5418e11a7e1e3632dba840ca72344170fe` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementReplay.test.ts` | B09 | 已完成静态主审 | `f8d066bef5b2ef25fc6b30a186c8e2bbc7c3dbcdd31c61735a20a6bab48be9f7` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorMove.test.ts` | B09 | 已完成静态主审 | `3d047d9002f6e1c65cada82a78abbdbb219f8c8930533773c078769621ac9d28` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorRelease.test.ts` | B09 | 已完成静态主审 | `d766d270eb2347b56117c939ee6f7e37f08c93e891cb3bf1ff6b7c582cab1d5d` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorStartDelivery.test.ts` | B09 | 已完成静态主审 | `189016cacd4dde41aef810dc7b3593cb20ffc9c65b471a6f712ead9f0c8ae55c` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorSteerDelivery.test.ts` | B09 | 已完成静态主审 | `7003ffc0e00b84a23b4a1c6352a512077a0ee8d139fd821e63ff0cc89295e843` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures.ts` | B09 | 已完成静态主审 | `e8aad56e7015173366f44b04a71ee616affe0df3ede95ed7a2541ddb5a291e35` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueInterruptionRecovery.test.ts` | B09 | 已完成静态主审 | `739a865f9dbea62fa3f0984345f744d4488c8cfe2730f1a81674031c2f2cae4b` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueManagement.test.ts` | B09 | 已完成静态主审 | `07d7e2df64f0a566c59be90345ffc666e845c75c94dbae97c9f710b723a5bc73` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueuePendingProjection.test.ts` | B09 | 已完成静态主审 | `1abdf653b598aa24bd7aa0a67e9de520a6d2d41d3ab1376d10c6a43253a2ccad` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueuePersistence.test.ts` | B09 | 已完成静态主审 | `360e6abd2bd3fa6f85be5655f563501e37f92ef5e9784891a1fba20911ec1bae` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts` | B09 | 已完成静态主审 | `0081cdc31375330c3c03a14fff005e868cb856a0dfa08c06e1243654c5b13bc4` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueStart.test.ts` | B09 | 已完成静态主审 | `4d5154d501d062bceadfa8e9b204755e197c06accb55d36df276911d5751f960` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueStartObservation.test.ts` | B09 | 已完成静态主审 | `8d4e67097692cbb87d28a13e3a7854883c549ce074357f4cebe16d6f8faca942` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueSteer.test.ts` | B09 | 已完成静态主审 | `fb6165f57802134aae770db543391535d4809596e6fac7f13c02c326ff9426ca` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueTestFixtures.ts` | B09 | 已完成静态主审 | `6c27f1c3b1d06429d0354bd8a7a039398ca7c21dd251dd4ca53cf4c2a811e404` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInterruptSnapshotPersistence.test.ts` | B09 | 已完成静态主审 | `42e2c873cb4e3eb297371e1587a3ec309e862768d452440741de89ecc1e9d765` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerInterruptState.test.ts` | B09 | 已完成静态主审 | `8e36c5aa124a4d57d81a8814ea3de3fada87d60943a99a304b1305c0c648e859` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerLanePersistence.test.ts` | B09 | 已完成静态主审 | `524f1fe6bea359e3bd33791610ff6a5f226412e5d29062328b1b594cd0fc958c` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerPendingInputMovement.test.ts` | B09 | 已完成静态主审 | `675cbd2d44afdb9662cedd60f1fea4322a3ab81ad7be32c67e5d405307e8b082` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerPendingInputScheduling.test.ts` | B09 | 已完成静态主审 | `4923455725cd5456d39f3014ad37f310557960124b25c753b098d1da7c400dcb` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerQueueRecordIdentityPersistence.test.ts` | B09 | 已完成静态主审 | `03c116866d64f4a531083d8b0b2c4759b43faf1a2d5c269ca1d7e9c35e79019f` |
| `codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts` | B09 | 已完成静态主审 | `9be2a7fcf45b1b6e9b249b2944901af67a72e04f53c9a13398087f452d9b1287` |
| `codex-gui/src/features/composerInputQueue/composerCoordinatorPersistence.ts` | B09 | 已完成静态主审 | `2dc6ca09d8b831e80e0fe0bde4f4e0de0ca6efd0b9b310f4f97a96cdb730185c` |
| `codex-gui/src/features/composerInputQueue/composerInputPreview.ts` | B09 | 已完成静态主审 | `cd511d3e40ee1f4a0a052c0ffac71606371827cb8faca292ead20dfe466f5218` |
| `codex-gui/src/features/composerInputQueue/composerInputQueue.ts` | B09 | 已完成静态主审 | `cf8cc7c82ba7dc1e7504f42730a6d102b23d7244b742ffa7fec112fa2b990b5d` |
| `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts` | B09 | 已完成静态主审 | `40af1bda43845bb83174f783c14fac892ae31952851637065cb0b7abcf0ec2dd` |
| `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts` | B09 | 已完成静态主审 | `481019be11891c45487c72752168129dec4a88cf42c51bf988f4a7ff70cd4ed0` |
| `codex-gui/src/features/composerInputQueue/composerInputQueueProjection.ts` | B09 | 已完成静态主审 | `3343aeb01d9f8e99de28c01dffb94e7758a5365a51338a0f728cab2ed823c755` |
| `codex-gui/src/features/composerInputQueue/composerInputQueueRuntimeObservation.ts` | B09 | 已完成静态主审 | `3d6bbafd2dd141a4091d73b0a558d221569daa975d2c1c6a94474c90e11f7e0b` |
| `codex-gui/src/features/composerInputQueue/composerInterruptState.ts` | B09 | 已完成静态主审 | `27f45dcf6adc9c6d4a99be8d33ae0ae6852735d03e7feca9a270c15fa02ad320` |
| `codex-gui/src/features/composerInputQueue/composerLanePersistenceValidation.ts` | B09 | 已完成静态主审 | `2e2707fde19da526e3f15e64235282faf38aa1f735ce16ff929f51eccea18299` |
| `codex-gui/src/features/composerInputQueue/composerOrdinaryQueueState.ts` | B09 | 已完成静态主审 | `21a37d89e9ef02f3729918c8931833f320223bfa708e8d2cc3a3fe126fbd8aca` |
| `codex-gui/src/features/composerInputQueue/composerPendingInputIdentity.ts` | B09 | 已完成静态主审 | `c3f7ac387b4f708f0a5ea7e8b9b7052ec922e2238bf356f42144b9f2d4786408` |
| `codex-gui/src/features/composerInputQueue/composerPendingInputLiveManagement.ts` | B09 | 已完成静态主审 | `6f7f8278a81c3795c319e6ba8e397c47004d9ac808911e6b5fd1388a3c85b30a` |
| `codex-gui/src/features/composerInputQueue/composerPendingInputMove.ts` | B09 | 已完成静态主审 | `74cb31c72aeea2819ffef6b18ba3782622991b8ae9009bb52192f2a69702dedd` |
| `codex-gui/src/features/composerInputQueue/composerQueueMessagePersistence.ts` | B09 | 已完成静态主审 | `21ca6fd8c6fca5fa24b7dfc8803346ffc298b9e9516b6d578e1b10ebd74f139e` |
| `codex-gui/src/features/composerInputQueue/composerStartQueueState.ts` | B09 | 已完成静态主审 | `0bc94c6e97968acd08028a74276ce9c3ca886632117ba6728fbd664977c684cd` |
| `codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts` | B09 | 已完成静态主审 | `1185b829f8713a2f22115a4a515639e35ecafe08b1840851bd1e7b93420a08ce` |
| `codex-gui/src/features/composerTurnControl/ComposerInputPreviewContent.tsx` | B10 | 已完成静态主审 | `023d752423d5f9e40a577f77936a1cda8fb3ea62b23d8396ff0232ec6ee107af` |
| `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx` | B10 | 已完成静态主审 | `31a0bf2a9e61216a294927da3ca868a06756d4aa530b20d5790c720654197b56` |
| `codex-gui/src/features/composerTurnControl/ComposerPendingInputEditor.tsx` | B10 | 已完成静态主审 | `f4d4d1ca16c0a9b3ffe9bc286c4a260675bb6e495f1c229197b93ae55391fb67` |
| `codex-gui/src/features/composerTurnControl/ComposerPendingInputEditorAdapter.tsx` | B10 | 已完成静态主审 | `e904d1400ea03a3425a213d21307168ca5669b36cbeb9a5c98aa89a69eda2fa3` |
| `codex-gui/src/features/composerTurnControl/ComposerPendingInputList.tsx` | B10 | 已完成静态主审 | `219914403206b0cb28248dd4231fb0ce94c19b5bb5c74a67c8123db1a68e6dbc` |
| `codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx` | B10 | 已完成静态主审 | `d85938d66ef1d6cc81d4ac27f7151bfa67437b37d3d7db42d788265341673249` |
| `codex-gui/src/features/composerTurnControl/ComposerPersistenceStatus.tsx` | B10 | 已完成静态主审 | `3bebc2c3ca1972fde3bd0c7eb778005548eb2ba4dbebd583983b2557ecb44756` |
| `codex-gui/src/features/composerTurnControl/ComposerSkillMenuLayer.tsx` | B10 | 已完成静态主审 | `b3cb22dee8b2a9fb9089eafe7f23c00b709112cfc38bf243e7efd365fb149bd9` |
| `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` | B10 | 已完成静态主审 | `0e9a8561cdcb0a2f18b0cabbf9b6c8921d52906874d4208adcbc34711a4a1418` |
| `codex-gui/src/features/composerTurnControl/ContextUsagePopover.tsx` | B10 | 已完成静态主审 | `6c0218adc8a350d882e656cd4ca03c77d25934e8be45db84e2fe5b185c5cba56` |
| `codex-gui/src/features/composerTurnControl/CurrentThreadStatus.tsx` | B10 | 已完成静态主审 | `3883083df2023630d0591281be64a9f3a63ab6e409a0c94393c4451320e969b5` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerPendingInputEditorAdapter.browser.test.tsx` | B10 | 已完成静态主审 | `75b87390983f8d88eb4f8dddfdb98dd15c54293f28a548b475bde173d1205119` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlCompaction.browser.test.tsx` | B10 | 已完成静态主审 | `e6ecab5ab31332ffd36a5353741951ae96ed6691e8321dc846b0d38801083b54` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlDelivery.browser.test.tsx` | B10 | 已完成静态主审 | `9545d378952aefaa851d6aad84b8393e7fd4b21373abe193ae639e50a0a9bc9c` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx` | B10 | 已完成静态主审 | `1c38bfa9f8a6e5ffd4f9ec7c421af618f494e46049a4fc0ebe3787d3fef7d50e` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx` | B10 | 已完成静态主审 | `5bcb4bce1f6c304efe1758886295e2f65955c5aa40bfbea495b09d030a93535b` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInputReordering.browser.test.tsx` | B10 | 已完成静态主审 | `832b51991ebda8f74048db11935ce6853c37083fa73743db11c72b839c057b2c` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlPersistence.browser.test.tsx` | B10 | 已完成静态主审 | `0aac41ae19ade4e76445f793438ed9eef9e488ef0e163f2bb0412d16a80d5a09` |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlSession.browser.test.tsx` | B10 | 已完成静态主审 | `3e61ca3aa6cec8ba97bc8a161aaddfc0dabe0e6faa319723f39b7d3c23d42ad2` |
| `codex-gui/src/features/composerTurnControl/__tests__/ContextUsagePopover.browser.test.tsx` | B10 | 已完成静态主审 | `62c986969591a190d693160647d77247df7de9df4063ab701ae8e70e31ee3009` |
| `codex-gui/src/features/composerTurnControl/__tests__/CurrentThreadStatus.browser.test.tsx` | B10 | 已完成静态主审 | `1ed9e72b5109ddb5f2fb168c2937e9b7972b3632d90ee1b6eeeb0618eecaaead` |
| `codex-gui/src/features/composerTurnControl/__tests__/composerPendingInputPages.test.ts` | B10 | 已完成静态主审 | `e9774eba2f6262b5fbe7adb8d451ec306453b50d693660259f1f2e8aed39f564` |
| `codex-gui/src/features/composerTurnControl/__tests__/composerPendingInputSession.test.ts` | B10 | 已完成静态主审 | `0b346daa5bc0e7bc851c42c71f8c5901f41757feced63e4da2f5492912e7a5c9` |
| `codex-gui/src/features/composerTurnControl/__tests__/composerTurnApplication.test.ts` | B10 | 已完成静态主审 | `accef3984ce3aaf32d4f1cd2af26381638d1f339023a9c413937451fa2755fcb` |
| `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport.tsx` | B10 | 已完成静态主审 | `d823bfb20be1825fd399255362d1b6ae083dd5076fba66d0d265ba0a21e0b0f7` |
| `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts` | B10 | 已完成静态主审 | `b9d936b8b238688d6ba29c81c68000d38906209475bb2d0a48d5aa88d0bf3396` |
| `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlPendingInputBrowserTestSupport.tsx` | B10 | 已完成静态主审 | `23b1411c32bc2ea51e64fcb7e43580f2717bc8132f8f37254c011e31a6be773a` |
| `codex-gui/src/features/composerTurnControl/__tests__/contextUsageModel.test.ts` | B10 | 已完成静态主审 | `5a3839bf7575a3009f5313800200b80a6f3b3728c6712e420c93a7676acc6e52` |
| `codex-gui/src/features/composerTurnControl/__tests__/currentThreadStatusPresentation.test.ts` | B10 | 已完成静态主审 | `c856e975d341166545c0a20ca7f472b2323ca8b80e2be4ca156d63a4215ecd1a` |
| `codex-gui/src/features/composerTurnControl/composerPendingInputPages.ts` | B10 | 已完成静态主审 | `bfe63c0d3ebdac4931bcadd86ad45915a44b9b23c0a6e2f8677dc8e895d7f08a` |
| `codex-gui/src/features/composerTurnControl/composerPendingInputSession.ts` | B10 | 已完成静态主审 | `f2a89a210efb3aab2ddf7d4df677f1a7c13b10ae2ce995757ee6f436d3fb7138` |
| `codex-gui/src/features/composerTurnControl/composerTurnApplication.ts` | B10 | 已完成静态主审 | `eaf165ee1729f2ab861d85c22387f611bba86b5879f4ee021b04a032304004c2` |
| `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts` | B10 | 已完成静态主审 | `8f9c917805646ae32e0da3f87e93b86bc8a40318406d8067d0d2d0093113e6db` |
| `codex-gui/src/features/composerTurnControl/contextUsageModel.ts` | B10 | 已完成静态主审 | `dc6b00e481e0c5e12f0a7b8d5d197ddff1f4da350f599fd8dd9b92dbe7d82e64` |
| `codex-gui/src/features/composerTurnControl/currentThreadStatusPresentation.ts` | B10 | 已完成静态主审 | `134733a7ca6c14f008a97e86f9c9e7d15d12b1b2a3a836adbcd5daab1285faf2` |
| `codex-gui/src/features/composerTurnControl/usePersistComposerDraft.ts` | B10 | 已完成静态主审 | `dd7b01a8441811aa6b0770e993d45ceb08964f324fd1270ff48b811831d2f756` |
| `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts` | B10 | 已完成静态主审 | `629a12ca172a6f65feaff76b7163a0c7d560a292068683093ca8f9a107f34aa7` |
| `codex-gui/src/features/currentTask/CurrentTaskPage.tsx` | B01 | 已完成静态主审 | `0fe58f3f1a6e3413e7cb04cc6111824b018089f7bad6d52197e641bc1387566b` |
| `codex-gui/src/features/documentTitle/DocumentTitleOwner.tsx` | B01 | 已完成静态主审 | `be0beb7f95389555d8a1d002ed87bd49c970d52caf35028c1099db7fb83b8b25` |
| `codex-gui/src/features/documentTitle/__tests__/documentTitle.test.ts` | B01 | 已完成静态主审 | `f192becb862e9e380c3ee1c7305fcccd28c13f97b092f29e604bee8cfe99d0d5` |
| `codex-gui/src/features/documentTitle/documentTitle.ts` | B01 | 已完成静态主审 | `931dd493ab3e970a0d409c102d0cfa0c61f98bebe690bb1267a0f44bf9b12c33` |
| `codex-gui/src/features/documentTitle/historyDetailTitleContext.ts` | B01 | 已完成静态主审 | `775c56c04ceb2078f5c0da2a547f250124d32bd750c058885dfab7091773b14a` |
| `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts` | B02 | 已完成静态主审 | `7e276633568219eb0d46356ea1f52512fe37acedfa54138c6bebfed719f2bc8e` |
| `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts` | B02 | 已完成静态主审 | `a3b73af2f7e6885da67b7864442be833df6da95d7d245452993c876de519fff8` |
| `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts` | B02 | 已完成静态主审 | `13d9251ed7acc8490bf63ea0e7757b70103d3533b7236277a9300847ad6577ac` |
| `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts` | B02 | 已完成静态主审 | `fb986ba340a5c3bc6ec3e3b45da45b810fcf97b23a84a61e5f013ede2a908290` |
| `codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts` | B02 | 已完成静态主审 | `9fbc2189a7c6a56b31c59c5983e61b26b8f612c3d047551be27f4c67eb61e053` |
| `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts` | B02 | 已完成静态主审 | `7ab0976b487d73a6f78b22b8a18a028ec7df27e464e76a970c303263c3774627` |
| `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts` | B02 | 已完成静态主审 | `e024cc1543aee73188ed68163b51b92eace1f6e11ab3ea9c6bf44e6c4199d02d` |
| `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts` | B02 | 已完成静态主审 | `92c4022457b399934e74280edf624b13478272e1ea7aea403959d17bd09c2a63` |
| `codex-gui/src/features/guiHost/__tests__/guiHostTestSupport.ts` | B02 | 已完成静态主审 | `e76b84e04dc64f3256ad7c401224fe753546c62b814d1eaff3735abb5555aa59` |
| `codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts` | B02 | 已完成静态主审 | `7cdd64db7f57c76df787a1d7576ede1eecece39b374791adc9bc3c376b73bfa3` |
| `codex-gui/src/features/guiHost/appServerProtocol.ts` | B02 | 已完成静态主审 | `7d4374715afb583fef9d5087c4c316b2117e67f96ccf3b2460b1f05205049b85` |
| `codex-gui/src/features/guiHost/guiHostClient.ts` | B02 | 已完成静态主审 | `397d6928009a4756ff48da61e35e4c78198a290c5ea67d0784fb4a95593af194` |
| `codex-gui/src/features/guiHost/guiHostCommandGateway.ts` | B02 | 已完成静态主审 | `75f611bad824319746044dd38fc90d63bbd418d05dd9f2c0b1bcdf5f3e7a18b9` |
| `codex-gui/src/features/guiHost/guiHostHandshakeController.ts` | B02 | 已完成静态主审 | `e28e2f7b936e14173b4ba44812091d038af208b296a34c04e1fb22e60f2a89c2` |
| `codex-gui/src/features/guiHost/guiHostProtocol.ts` | B02 | 已完成静态主审 | `ca19952b2967bbeafaff37dcdd3eacd9aace7e56b4cf0a463afde49d08626620` |
| `codex-gui/src/features/guiHost/guiHostTransportSession.ts` | B02 | 已完成静态主审 | `5ca6523b777e98310d951d5ce4d720fcc504f941a49997bdc29069eb89c18c98` |
| `codex-gui/src/features/newSession/NewSessionPage.tsx` | B04 | 已完成静态主审 | `3e3c6a5d31f75ce10a24c8d66ae6bf6e395ec55301fdd641e4e233b3976c83c1` |
| `codex-gui/src/features/newSession/__tests__/newSessionOwner.test.ts` | B04 | 已完成静态主审 | `2dbfad4d203e5e91e9766b8c02b3ae6f34d719dedb190068f40a9ea206c0ba43` |
| `codex-gui/src/features/newSession/newSessionOwner.ts` | B04 | 已完成静态主审 | `08ed1ab22b979c4f823285ed5badf3497baa7ce737e5fc1fce49ccbd793a9466` |
| `codex-gui/src/features/projection/__fixtures__/attach-baseline.json` | B12 | 已完成静态主审 | `28034add2238f940ef91e57b8fabe197e5ef0a4ae0bec098e534d3da6c210f40` |
| `codex-gui/src/features/projection/__fixtures__/attach-replacement.json` | B12 | 已完成静态主审 | `56dbd2b08527e31cf080adbd823ea710a9d76402adc2f939c80ef864e8f9eb1f` |
| `codex-gui/src/features/projection/__fixtures__/closed-backpressure.json` | B12 | 已完成静态主审 | `325a0bba882a928c895240386e81316135f2c780415becebe4281eae7edc11e4` |
| `codex-gui/src/features/projection/__fixtures__/event-agent-message-delta.json` | B12 | 已完成静态主审 | `0ddd82b37fe99f96165ac3ffdca683f643dc775d77d280912118be6808e7a210` |
| `codex-gui/src/features/projection/__fixtures__/event-item-completed.json` | B12 | 已完成静态主审 | `37f6191b0856502004ac82de0f74d6f829d5d698f30caf9d68cf443481f5dab3` |
| `codex-gui/src/features/projection/__fixtures__/event-item-started.json` | B12 | 已完成静态主审 | `75cb3fcef918d2a0769430c64787e8b0aeecd9d93a0b7a6c357c8889dc064348` |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-item-completed.json` | B12 | 已完成静态主审 | `93bf89063ed59e49a54f3c0a20e7dbcce3368f969744dca5ccb07482238d7a3a` |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-item-started.json` | B12 | 已完成静态主审 | `a1ea0b12723200bec818f7b2b67ff6e1a772d17c1b3e76ab3e6cc0504e1b3bb8` |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-summary-part-added-delta.json` | B12 | 已完成静态主审 | `4a7f4c53e5b8581fdffcdb798a5f54ecf9d6fe37ceff620cc5ce567abd12a29d` |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-summary-text-delta.json` | B12 | 已完成静态主审 | `15fbfb100411369c0267f2ab388001c15ba63e0c2827f37d05e8a24deac49a42` |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-text-delta.json` | B12 | 已完成静态主审 | `325c99a40d956dfaad050180e735524e8424678a953ada9c5825720bf747bf6c` |
| `codex-gui/src/features/projection/__fixtures__/event-subscription-replacement.json` | B12 | 已完成静态主审 | `4059b69e0c5d6bf889fbe2eeab42f4cb885ea6075f1094dc476c69a5c61ca687` |
| `codex-gui/src/features/projection/__fixtures__/event-token-usage-updated.json` | B12 | 已完成静态主审 | `230e16aa392a2f35023fdd9ba130027fade788aa5d7f67134175354b0d082b57` |
| `codex-gui/src/features/projection/__fixtures__/event-turn-completed.json` | B12 | 已完成静态主审 | `db44080192996ed38e3935007736e58acc6c6450e70251a983e2a5924bc4d603` |
| `codex-gui/src/features/projection/__fixtures__/event-turn-started.json` | B12 | 已完成静态主审 | `90a044895c2bee5d5ca50703456818801cb87ab1bd48bd72ca3519b01612c7e4` |
| `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts` | B12 | 已完成静态主审 | `4c958118bf1f8f1cfc0c673c10b8288edc27e7f179742f16d838b86c20e2baa7` |
| `codex-gui/src/features/projection/__tests__/projectionFixtures.ts` | B12 | 已完成静态主审 | `8e5df5dd3528e721b72d5da29b4d7dcb3ba2f6b44d1d8f9e4a9f287d220b8f74` |
| `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts` | B12 | 已完成静态主审 | `6186647e1c44ab03dcbe7d025cce8749d69d45615f7439da5d1ab995839820d6` |
| `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts` | B05 | 已完成静态主审 | `ee71a51ba1c7c05af5e280a04ffae6c1cf106b90663d627c34f61ecdb28b174d` |
| `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts` | B05 | 已完成静态主审 | `cfbe693ae74f9346e2ba2e0827b87941f33cc90777f83976892845ccf644e732` |
| `codex-gui/src/features/qrAccess/QrAccessPopover.tsx` | B11 | 已完成静态主审 | `4d7e6b42a4817e93eeff81bd822b76ef0b8a77f95f2d90ce3ff1eb9d40316955` |
| `codex-gui/src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx` | B11 | 已完成静态主审 | `b046c384977632be8463d8a21230ae817a2c196942957b3d9b1b5985677d1a63` |
| `codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts` | B11 | 已完成静态主审 | `4a12d1cb860c8c253d603e7a966eb18b0aac90ef15f2e402447f08a0849c0129` |
| `codex-gui/src/features/qrAccess/qrAccessUrl.ts` | B11 | 已完成静态主审 | `0e0f67afaea8f14335069d3600dcbb16e935220e868d1d43a8e05b8becc5847b` |
| `codex-gui/src/features/sessionCollection/__tests__/sessionCollectionPersistence.test.ts` | B03 | 已完成静态主审 | `e96dd2169fc01ba17bb86db735b0a36b6b0566ed3894a79a166bcaa522772b75` |
| `codex-gui/src/features/sessionCollection/sessionCollectionPersistence.ts` | B03 | 已完成静态主审 | `0eac01421cf55fa8dcb0b0424391d87d3d3643fc1f2b4146b9f8fb8351bae99f` |
| `codex-gui/src/features/skillCatalog/__tests__/skillCatalogOwner.test.ts` | B08 | 已完成静态主审 | `9701d721c3da7c83692e7745ba0b992c879076475f64d01abee2545cff1e543a` |
| `codex-gui/src/features/skillCatalog/skillCatalogOwner.ts` | B08 | 已完成静态主审 | `0b36f6d7469ca9b68e49b46ddd8034306a6f35abfa5b5b0e9bf6fbf75668ae07` |
| `codex-gui/src/features/threadHistory/ContinueTaskAction.tsx` | B04 | 已完成静态主审 | `98422b5e227a6aecee9d3d2728a60f9fbe97a2d863b15521e51ef6966e1db091` |
| `codex-gui/src/features/threadHistory/ContinueTaskFailureAlert.tsx` | B04 | 已完成静态主审 | `943f1e31b55ed9b3badf2ab0168fcdabf2ad7e33e1ded84446749bb401fdf2a8` |
| `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx` | B04 | 已完成静态主审 | `5fe27bb18eef29835335b5dfd230044c84e29cf602ac382d1b3a7d17678de97c` |
| `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx` | B04 | 已完成静态主审 | `d77d605b4c7b5f51c28e29c2a7e265c770461456d060c4b663f15e75502f6955` |
| `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx` | B04 | 已完成静态主审 | `8c835ef6e8512dce6dcf8f07010c95d6e5302438983e221482273c826f6df562` |
| `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx` | B04 | 已完成静态主审 | `8aa4eed0e1567aff1cc460bcd7ca9bc232b7c8f9b16c35936ce3bda181f1b107` |
| `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx` | B04 | 已完成静态主审 | `472cd5c7d3a6b96d83636bf4bcf347ee34fab74423fe80cd39944526c5ba1321` |
| `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx` | B04 | 已完成静态主审 | `6c70f8db8a788fb4831b3678a36352915f9aabea637c8113d8270dc678e8fe1c` |
| `codex-gui/src/features/threadHistory/__tests__/threadHistoryDateGroups.test.ts` | B04 | 已完成静态主审 | `8a9276cd8dd14a002c3c1008908cd6a00d30849a5fcfcd884e536db3389f989d` |
| `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailBrowserHarness.tsx` | B04 | 已完成静态主审 | `2ce0d1b78224cf7d92c864444f2d8bd290a281d5fee43b22e3d540114d6416f1` |
| `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts` | B04 | 已完成静态主审 | `2be8910f3d8112e12a28c7368930d32f6f3642bfc25cd73bd7d0a3715d4db961` |
| `codex-gui/src/features/threadHistory/__tests__/threadHistoryListOwner.test.ts` | B04 | 已完成静态主审 | `e5c0a1a5fc11f84f55756c88591163224b346c9c16fbb821f3451ec616c38ae3` |
| `codex-gui/src/features/threadHistory/__tests__/threadHistoryListPageBrowserTestSupport.tsx` | B04 | 已完成静态主审 | `4acaded511886da471ddfa30affa95f317a3ad98ae509c70ffb529a0145e2b88` |
| `codex-gui/src/features/threadHistory/__tests__/threadHistoryPresentation.test.ts` | B04 | 已完成静态主审 | `d40217080ff0587ef0fcdbc4aa49829fe8958d250380550412cf67b81f504893` |
| `codex-gui/src/features/threadHistory/threadHistoryDateGroups.ts` | B04 | 已完成静态主审 | `efa10982825a7048f75e668e15900d3f6dd63907d9fafc9e9f787a78174f8202` |
| `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts` | B04 | 已完成静态主审 | `0974e673d502103979d97faa6f4908b25940dec440f16ff97efcdf7deeb85791` |
| `codex-gui/src/features/threadHistory/threadHistoryListOwner.ts` | B04 | 已完成静态主审 | `8c7ae1fe8c30389e583932ee734d6239388d75cbd54e9dfd6c690465efa47bcd` |
| `codex-gui/src/features/threadHistory/threadHistoryPresentation.ts` | B04 | 已完成静态主审 | `ae383e551578880d9e8d3b3477b7a163be970474048e55caef15c59883cb540c` |
| `codex-gui/src/features/threadHistory/useStrictModeSafeOwner.ts` | B04 | 已完成静态主审 | `503732f938dc45674a0b35066a32ea3a2ffca8a5328dddf270a9327de20676e5` |
| `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts` | B05 | 已完成静态主审 | `139becdcebf4ca9c30f49c1ccb7cd0e44c4971f009851a2012edbbbef3c4dc2c` |
| `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts` | B05 | 已完成静态主审 | `131f96db431a1b53a9d2fc10fe1ea5b68587eec5047890e70c6382aba7e57701` |
| `codex-gui/src/features/transcriptState/__tests__/requiredTranscriptState.ts` | B06 | 已完成静态主审 | `3d96584aa3c9e743876d67ef26c7d72d1e4bcecd9416e986174234170b1368cc` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptCollabAgentItemPolicy.test.ts` | B06 | 已完成静态主审 | `c257516520a7cd419799cfbbfdcde658a6086b13f011dff4a943aae86a1af0d2` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptContextPages.test.ts` | B06 | 已完成静态主审 | `9ade487c6a51b48d0826fbd161a56141b434f72ba200308b72f1f83b5f9defb5` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts` | B06 | 已完成静态主审 | `1c20d1d3e33539c269e84955cdb1d83730116b80fda6b6ef75b8a2f82696ccf6` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptSessionSlots.test.ts` | B06 | 已完成静态主审 | `f5162aaa8e20f75327dab195253493c44bb563092190b1592b8f9e2206631202` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateAgentMessageStreaming.test.ts` | B06 | 已完成静态主审 | `a17a3c41375298bba3a7ace55037159d446a0c84da06d5ca4a5395b01e1b2f04` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedActivity.test.ts` | B06 | 已完成静态主审 | `e39540e77f9dbeb2313be1d7139d4cf5f526e5e1b2d823b051f81a7bddbb2dc6` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedMessages.test.ts` | B06 | 已完成静态主审 | `5ceaff7375d67ecf8f14b2fae2b77856960082d82bb535dc4a404933c209356a` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedTerminal.test.ts` | B06 | 已完成静态主审 | `21721813c92c6e307feee5a9eed0c13c25ac969d267dc7ebf29f7550f62da735` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemPlacement.test.ts` | B06 | 已完成静态主审 | `f4920596992efe3d77483bb28cd986984095159d00d20dda710b17c5e573d0dc` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemSettlement.test.ts` | B06 | 已完成静态主审 | `2d71fbb940bba7ab75eea121248b5c5e80e5cbd0f94938f329d844ee6999cb4d` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateReasoningStreaming.test.ts` | B06 | 已完成静态主审 | `3e4b0def55627f6c89fae963b72b3016122fcd31e6c49d4912b93544c84a8eca` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts` | B06 | 已完成静态主审 | `7547ef5ab77ccb94c6a362acd14a9823a1d5b9a93fb6b935e6cf0358ee1c9015` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts` | B06 | 已完成静态主审 | `25f77c8f11cbcc020638253df5d2c302e6f2bf75e2ce0adc846810cef9518432` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts` | B06 | 已完成静态主审 | `f09e1a460146483e471dfdebd863cb409c425d6ddc450290e6dcbd5a2712c2e2` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts` | B06 | 已完成静态主审 | `84239179995e44288af54aec04be6ebbf16c4999f5674a8eddfb961c576a3ec4` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts` | B06 | 已完成静态主审 | `452b213f47ffe82dbc6a2fc335d939c316a13e6d02a7f290c14706c97ed9ce2a` |
| `codex-gui/src/features/transcriptState/transcriptContextPages.ts` | B06 | 已完成静态主审 | `75d9ee43e00d2baf4b48c7a70f4c53f6b460e8a8d26abcf9580d95790c413686` |
| `codex-gui/src/features/transcriptState/transcriptEventDedup.ts` | B06 | 已完成静态主审 | `48bf361905bd2afd5329af3a22660ebe9118790ac678c9b2c96c10bd0a790dcd` |
| `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts` | B06 | 已完成静态主审 | `f067982c43a602f1220b76d08f9e6de038d8dbd74b8271dfd1868c3db9e0ad57` |
| `codex-gui/src/features/transcriptState/transcriptProjection.ts` | B06 | 已完成静态主审 | `d97422f4c60b6b4da960fd2e1f4ebf420b6291c12293938b1a17d030efe9e67d` |
| `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts` | B06 | 已完成静态主审 | `bbd45b751b2686d78085845bb89f579a9ccc8662e03ade80d4ac01a92c2a351b` |
| `codex-gui/src/features/transcriptState/transcriptStateModel.ts` | B06 | 已完成静态主审 | `13daf734be5dbbffddc85b9d3104ed0013b3c056e2c2af6eb7a01bec952c0bb5` |
| `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts` | B06 | 已完成静态主审 | `0398001fbe91cd3f0e039418bbdb3270cef471a73cd4db1bdd1b4a3fce84b973` |
| `codex-gui/src/features/transcriptState/transcriptStateSlice.ts` | B06 | 已完成静态主审 | `c631003022a543cbaa0729a9d39b98dc3ca38139bed69a6993aee8bcfddd1d2e` |
| `codex-gui/src/feedback/FailureDiagnosticModal.tsx` | B11 | 已完成静态主审 | `0094e8c91920595a1a1dc1f397092250b8ee83d04621ce4a4cddfb2627a2be89` |
| `codex-gui/src/feedback/FailureLayout.tsx` | B11 | 已完成静态主审 | `dd97a52c000721e7c0a7da2bdef9147e877d2865a45b91973b073ea68fcd1243` |
| `codex-gui/src/feedback/__tests__/FailureDiagnosticModal.browser.test.tsx` | B11 | 已完成静态主审 | `0994eadad89dfc9ded6c64ddc49c12527ee2142a246637baa087f2a7c3d196f9` |
| `codex-gui/src/feedback/__tests__/FailureLayout.browser.test.tsx` | B11 | 已完成静态主审 | `31e9bd8b5df705c17591ba0e792480bd56b40613937a8699236ea8e4e6ce52f1` |
| `codex-gui/src/feedback/failureLayout.css` | B11 | 已完成静态主审 | `13d03ba4efb64d1d4f5f3700a479fd3b6aa73ae219b473b9c629df5584ef8638` |
| `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts` | B12 | 已检查生成链与契约 | `ced9363fad59f7242862a09ed7a9bcb2be83c5d4060af6365faf153b72c8ff1e` |
| `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js` | B12 | 已检查生成链与契约 | `21493290b763932cf7f9ba42c153f2a188e10ea9108732745e43768148a1149f` |
| `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.raw.js` | B12 | 已检查生成链与契约 | `dfe8fa81dac3344f1c636d3b1b53df70617b634322d8968c4a3d12d90fbca876` |
| `codex-gui/src/generated/appServerProtocol/index.ts` | B12 | 已检查生成链与契约 | `896a2557ffe6583686b6632700e75c394485b74d7066d1469129c9705510eaa1` |
| `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.d.ts` | B12 | 已检查生成链与契约 | `511807d3c0bf84e27b522ec22650e479caf99a292ace4f487f4c40e73e0decb7` |
| `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.js` | B12 | 已检查生成链与契约 | `63775540afce6e6259956de943ff0b5ee9c8cde897f35d0e43727e5014ff778d` |
| `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.raw.js` | B12 | 已检查生成链与契约 | `bd24fff6a551d5079353e3049fd6c65793002aea601bbd7b8c9cb7cd3392c8cd` |
| `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts` | B12 | 已检查生成链与契约 | `5e5984c6bdff76ede5e8a63e5d2ea5ffdd663c9c2d2a95d441216a1da9104aa8` |
| `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts` | B12 | 已检查生成链与契约 | `a1dc55b9237fe52cbe3ccd3c1b6902c67e79aea72f5d4fa769c352c7bfce9666` |
| `codex-gui/src/generated/guiHostContract/index.ts` | B12 | 已检查生成链与契约 | `ba5a1904f4f4dfe9345b3a2510434fe2745f935f331262759957c83527625564` |
| `codex-gui/src/generated/guiHostContract/standaloneValidators.d.ts` | B12 | 已检查生成链与契约 | `9c759da3bd7517fff42d4baa5fda110bd3e0196268f0e68fe3d5ab5041017bcb` |
| `codex-gui/src/generated/guiHostContract/standaloneValidators.js` | B12 | 已检查生成链与契约 | `75f57fdffd51915583f10bb4832edb02f41bfa96865a3cb8026693782492aebc` |
| `codex-gui/src/generated/guiHostContract/standaloneValidators.raw.js` | B12 | 已检查生成链与契约 | `40eb9cd69d7bce586fad7a31497580a0d1ed288f96fb3ca4fd0b4c3a42342b6e` |
| `codex-gui/src/generated/guiHostContract/validatorRegistry.ts` | B12 | 已检查生成链与契约 | `746e9d363ee6c51076ed5ec8fc25304e2191be00160d62f647c6b2e472f04ece` |
| `codex-gui/src/i18n.ts` | B11 | 已完成静态主审 | `abd9a27f49c11f0e1a6fe874b757c87e8fa881bb651a2b15a8de29b518f10c09` |
| `codex-gui/src/identity/__tests__/randomUuid.test.ts` | B11 | 已完成静态主审 | `5704d4977284b63f811e28b633806b855489aa57abd234035d9f37e8ff5dfb0d` |
| `codex-gui/src/identity/randomUuid.ts` | B11 | 已完成静态主审 | `e49e68bf8883b3c5f3e75be81582c2b1379f4e08a7a66df0b4f23f4f7a6a3cb6` |
| `codex-gui/src/index.css` | B11 | 已完成静态主审 | `2436b8258ca7cc0256dd6b0547eb5dbded10fda60cb8b26e19bf47e7f0b30fbc` |
| `codex-gui/src/locales/en.po` | B11 | 已完成静态主审 | `0bf136f9e7aa6eb0c524128acacd0df75ec32231493fee30e662ac428de7629a` |
| `codex-gui/src/locales/zh-CN.po` | B11 | 已完成静态主审 | `710d02796b883ba93ddc375437cde7b25d667082664bea5a779eb202280a2280` |
| `codex-gui/src/main.tsx` | B01 | 已完成静态主审 | `0a3b484a9b07ccc4b6e55dad6619e13564bfc5c39f2e71cf1c7b4208231b7531` |
| `codex-gui/src/router.tsx` | B01 | 已完成静态主审 | `e240e9791c2f3755a1761d80bdcf705a343177952bc12723bee724340b272adf` |
| `codex-gui/src/routerComponents.tsx` | B01 | 已完成静态主审 | `4c275873ac072523548228b597cfc5be695b95531b78b08ed2c8c92a380e833d` |
| `codex-gui/src/subscriptions/__tests__/listenerSet.test.ts` | B11 | 已完成静态主审 | `d9b5dcf5f8f3b1b3baae637864c16da7e88152b3dea34bed4be9bae88d1a1bf0` |
| `codex-gui/src/subscriptions/listenerSet.ts` | B11 | 已完成静态主审 | `2d92227aca312cb2adc2847d83d7b3526589bcd4f606918a169927183448bad9` |
| `codex-gui/src/text/__tests__/grapheme.test.ts` | B11 | 已完成静态主审 | `b336005c276ac1d899afe6b8b7b87f38a1d48ecd7b42c32138b1a913075c77fe` |
| `codex-gui/src/text/errorText.ts` | B11 | 已完成静态主审 | `df5d86b73755c1b0f4edf32b7fcb3093f1f92e45f05c37e5a78929e8c38e25ba` |
| `codex-gui/src/text/grapheme.ts` | B11 | 已完成静态主审 | `a8a1884889c5307d471d127c27835810241d8929bf24b8006bb9942c9a4efbfb` |
| `codex-gui/src/utils/TestProvider.tsx` | B13 | 已完成静态主审 | `0985d219cc87deac13f611a1a9fc1ef6016b23276bd25cd0c5701297b7f9efeb` |
| `codex-gui/src/utils/test-utils.tsx` | B13 | 已完成静态主审 | `41802f64a5a6baebd2c8c7c29f2914c2328570e5fed58ea910875e4f86f5d323` |
| `codex-gui/tsconfig.app.json` | B13 | 已完成静态主审 | `21d313a36b94ca6f482be516ba9059043466ac1c501867b4bc4b4639a7950908` |
| `codex-gui/tsconfig.json` | B13 | 已完成静态主审 | `83cfa01679eafada4316fca8cb0b85a5e7efafc80fb4f46329200ef1c47a09dd` |
| `codex-gui/tsconfig.node.json` | B13 | 已完成静态主审 | `01a318b1112a3f16b77458ef2b22118c84ce2c4eb6163de1fbd143a3919b36fd` |
| `codex-gui/tsconfig.vitest.browser.json` | B13 | 已完成静态主审 | `6c6da7c7f046d3dbfa11e252ace6c776b5bcf7ed8eb661451da1aa9cec36bb18` |
| `codex-gui/tsconfig.vitest.json` | B13 | 已完成静态主审 | `7de0cdeddc693f08419746a6a2ee580dcd138828effdb7d5b67f83ee1ced9c1d` |
| `codex-gui/vite.config.ts` | B13 | 已完成静态主审 | `335465c7206daf46e0e84eb287d9569248c3ed6a40860d57535cea73ceff1386` |
| `codex-gui/vitest.browser.parallel.config.ts` | B13 | 已完成静态主审 | `c67cc87d2e717dc1c0e021750f1ff6d25a89dca90536095c4a2edb66b33a3ddd` |
| `codex-gui/vitest.browser.sequential.config.ts` | B13 | 已完成静态主审 | `131ae691488667c88604a73c7c68f466f380b929433d5fa2dfb75fc7cbffc35d` |
| `codex-gui/vitest.browser.shared.config.ts` | B13 | 已完成静态主审 | `a0388b2fcc088aace5c974e0d4f557e61eff82d05421bb010efa124f4cfa9793` |
| `codex-gui/vitest.browser.smoke.config.ts` | B13 | 已完成静态主审 | `a0de2f5376d629396b0d7b528fa571d37092ac331272db559ca5ced288f48e59` |
| `codex-gui/vitest.config.ts` | B13 | 已完成静态主审 | `905c79787a8d656c223a3ba0d4285bde99f0db6879ac65d852ebf78baefb1b8c` |
