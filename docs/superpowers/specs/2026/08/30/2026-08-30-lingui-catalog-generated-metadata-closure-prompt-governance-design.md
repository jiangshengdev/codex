# Lingui Catalog 生成元数据闭包提示词治理设计

日期：2026-08-30

状态：设计已确认

确认日期：2026-08-30

确认选择：A（分层治理）

设计分支：`dev`

设计时 Codex HEAD：`64e578d9121a2116359e6659fade53fa8a19a538`

设计时 `codex-config` 分支：`main`

设计时 `codex-config` HEAD：`a5c3c36efc82f3555774811b92d29455b445ddf4`

## 唯一主目标

建立一套适用于权威生成器闭包、并对 Lingui catalog 提供项目级细化的提示词治理规则：当计划内生成命令产生确定、可解释且语义不变的元数据归一化时，不再因为计划预先枚举的 hunk 或旧行号失效而暂停；当生成结果改变用户可见语义、超出生成物边界或无法证明稳定时，仍必须停止并回到相应阶段。

全局系统提示词保持简洁。通用判断由现有 workflow skills 拥有，Lingui 字段语义由项目级 skill 详细说明，`codex-gui/AGENTS.md` 只承担项目路由。

本文只定义责任分层、继续与暂停条件、Lingui catalog 分类、计划写作约束和验收不变量。它不是 implementation plan，不定义任务顺序、执行图、提交拆分、精确命令或逐字写入文本，也不授权修改提示词、skills、catalog、Lingui 配置、Git index 或本地提交。

## 背景与真实阻塞证据

当前 selected-skill display 计划把两个 Lingui catalogs 纳入明确生成边界，并要求运行项目固化的 message extraction。计划同时把生成节点的完成证据限定为“catalog diff 只含本功能 messages/comments/refs”，把“unrelated catalog churn”列为重新计划条件。

实际 extraction 产生了两类结果：

- 本功能新增的两个 `msgid`、translator comments 与对应 source references；
- `en.po` 和 `zh-CN.po` 中各 11 个既有 `SkillTypeaheadPlugin.tsx` source-reference 行号更新。

`SkillTypeaheadPlugin.tsx` 不在当前 feature dirty set 中。既有 catalog 保存的是旧源码位置，权威 extraction 根据当前源码重新计算了 `#:` 行号。现有 `msgid` 与 `msgstr` 没有因这些行号更新而改变，也没有新增 catalog 文件或扩大 locale 边界。

因此，阻塞不是产品范围真实扩大，而是计划使用了 hunk 级预期来约束生成器的完整输出。手工恢复这些旧行号只能制造非权威 catalog 状态；再次 extraction 会重新产生相同归一化，反而使计划要求的 stability 无法成立。

## 根因

现有治理分别覆盖了阶段门禁、计划文档和 Lingui 使用方式，但缺少两个相接的契约：

1. 通用 workflow 没有明确区分“生成物边界扩大”与“边界内权威生成器的确定性元数据闭包”。
2. 计划文档允许把预计 hunk、旧行号或“仅本功能引用”写成 retained-diff 白名单，使执行期只能把生成器的合法全量归一化误判为范围变化。
3. 现有第三方 Lingui skills 提供国际化实践与 translator context 指导，但不是当前项目的 catalog 生成物治理 owner，也不应被定制修改。

## 目标

- 对权威生成命令产生的边界内闭包建立通用、可审计的继续条件。
- 保留对语义漂移、范围扩大、非确定性输出和未知生成链的暂停能力。
- 使计划以“生成物边界 + 语义验收”约束结果，不依赖易漂移的源码行号或预计 hunk。
- 为 Lingui 明确区分 `#:`、`#.`、`msgid`、`msgstr`、fuzzy/obsolete 状态、catalog 边界与二次 extraction stability。
- 保持系统提示词简洁，把详细领域规则放在项目级 skill。

## 非目标

- 不把所有生成器的字段语义收进全局提示词或通用 workflow。
- 不自动接受生成器产生的任何 diff，也不把“generated”视为免审标签。
- 不修改 Lingui extraction 配置、catalog 格式、locale 集合或翻译策略。
- 不裁决或继续执行当前 selected-skill display feature。
- 不修改第三方 `.agents/skills/**`、OpenAI 官方 skills 或现有第三方 Lingui skills。
- 不借本设计重写全部计划文档、清理历史 catalog 元数据或处理其他生成物问题。

## 已确认方案：分层治理

用户选择 A：通用阶段 owner、计划文档 owner、项目领域 owner 与前端路由各自只承担一层职责。

### 全局 `AGENTS.md`：保持不变

`/Users/jiangsheng/cnb/codex-config/AGENTS.md` 已经规定根因修复、检查能力保留、关键事实闭包、阶段变化和项目规则归项目 owner 等跨任务不变量。本设计不向其中追加 Lingui 字段、生成器算法或新的 workflow 细节。

保持不变不是遗漏：生成元数据闭包属于阶段与计划契约的详细判断，已有明确 skill 路由可以承接。向全局文件增加专项条目会重复 owner，并违背系统提示词简洁目标。

### `$managing-work-stages`：通用继续与暂停条件 owner

在 `codex-config/skills/managing-work-stages/references/stage-gates.md` 中补充通用 generated metadata closure 契约。它只回答新生成结果是否改变根因、范围、行为、接口、数据、安全或验证，以及应该继续还是回到门禁。

该 owner 不解释 Lingui 字段，也不列出具体生成器、项目命令或 catalog 文件名。

### `$project-doc-workflow`：计划表达 owner

在 `codex-config/skills/project-doc-workflow/references/plan-document-contract.md` 中规定：计划必须声明权威生成入口、生成输入、完整生成物边界与语义验收；不得使用预计 hunk、旧源码行号、现有 source references 或“只保留本功能引用”限制权威生成器的边界内闭包。

该 owner 只规定计划如何表达和保留验收能力，不重新判断某个 Lingui 字段是否属于语义变化。

### `$lingui-catalog-workflow`：项目领域 owner

在 Codex 项目的手工 skill 根 `/Users/jiangsheng/cnb/codex/.codex/skills/` 下新增 `lingui-catalog-workflow`。它拥有 codex-gui Lingui catalog 的字段分类、catalog 边界、翻译保留、diff 审查和二次 extraction stability 细则。

该 skill 消费 `$managing-work-stages` 的继续/暂停结论和 `$project-doc-workflow` 的计划表达契约，不复制通用阶段状态机、动作授权、执行图或项目命令发现机制。

### `codex-gui/AGENTS.md`：一行项目路由

`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md` 只增加一条简短路由：涉及 Lingui message extraction、catalog diff、翻译或 stability 时使用项目级 `$lingui-catalog-workflow`。

该文件不展开 PO 字段分类、验收表、命令、locale 清单或继续/暂停算法。

## 通用 generated metadata closure 契约

### 允许继续的必要条件

只有以下条件全部成立，边界内额外 diff 才属于计划内生成闭包，而不是实质范围扩大：

- 使用当前项目确认的权威生成入口，输入、配置、工具来源和执行环境已经完成适用预检。
- 受影响文件全部位于计划声明的完整生成物边界内，没有新增未声明生成物、locale、schema、快照或其他输出类别。
- 额外变化可由当前生成输入确定地推导，属于生成器拥有的定位、排序、派生注释或其他明确分类的元数据。
- 计划要求的目标语义变化仍然可单独识别；边界内既有用户可见内容、协议、翻译、标识、状态或验证基线没有发生未计划变化。
- diff 审查能说明每类额外变化的生成来源和非语义理由，而不是仅凭文件是 generated 就接受。
- 在完成计划内人工补充后，再次运行同一权威生成入口达到稳定状态，不反复改写、丢失人工内容或产生新类别 drift。

满足这些条件时，执行者记录闭包证据并继续后继验证；不需要把确定性元数据归一化重新解释为新的产品交付物，也不需要为旧 hunk 失效请求形式化范围确认。

### 必须暂停的条件

出现以下任一情况时，不能使用 metadata closure 继续：

- 输出落到计划声明的生成物边界之外，新增文件、catalog、locale 或其他输出类别。
- `msgid`、翻译、协议字段、运行时数据、用户可见内容、状态标记、快照基线或其他语义字段发生未计划变化。
- 生成入口、输入、配置、版本或 owner 不明确，无法证明额外 diff 的来源。
- 同一输入重复生成不能稳定，输出顺序或内容非确定，或者人工补充在再次生成时丢失。
- 为接受 diff 需要修改检查、放宽断言、扩大 ignore、删除覆盖、手工恢复生成器拥有的元数据或跳过稳定性验证。
- 新证据足以改变原根因、计划文件边界、产品行为、接口、数据、安全或验证方式。

暂停只影响该生成节点及其依赖后继。执行者按 `$managing-work-stages` 回到对应门禁，不把未知 drift 包装成机械 churn。

## Lingui catalog 专项分类

### `#:` source references

`#:` 是 extraction 根据当前源码位置生成的定位元数据，不是 message identity 或翻译内容。源码增删、格式化或 extraction 版本所依据的当前树变化可能使未直接编辑文件的旧行号一起归一化。

当引用路径真实存在、message 映射正确、变化位于已声明 catalogs、没有伴随 `msgid`/`msgstr` 或状态漂移，并且二次 extraction 稳定时，`#:` 的增加、删除、合并与行号变化属于可接受的 metadata closure。计划不得把旧行号或旧引用集合当作保留基线。

引用指向错误 message、消失的非预期 source、边界外 source 或重复生成持续漂移时必须暂停。

### `#.` extracted translator comments

`#.` 是从源码提取、供翻译者理解 message 的上下文。它由生成器维护，但会影响后续翻译判断，不能与纯定位行号完全等同。

计划内新增或修改 message 对应的 translator comments，以及同一 source 的确定性归一化，可以在内容准确、placeholder 解释完整并通过二次 extraction 保留时接受。既有 message 的 comment 内容出现无法由当前 source 解释的新增、删除或语义变化时必须审查；不能仅标记为 metadata 后自动继续。

### `msgid`

`msgid` 是 message identity 与源语言语义，不属于 metadata closure。新增、修改、合并或删除只能来自计划声明的用户可见 message 变化，并与源码调用点一一对应。

任何计划外 `msgid` drift、意外 obsolete message 或 identity 合并都必须暂停，即使它由 extraction 自动产生。

### `msgstr`

`msgstr` 是 locale 的用户可见翻译结果，不属于 metadata closure。已有非空翻译必须被 extraction 保留；新增 `msgid` 的翻译只能按计划和 source context 补充。

既有 `msgstr` 被清空、改写、错配，placeholder 或 ICU 结构漂移，或者非目标 locale 出现翻译变化时必须暂停。不得以生成文件为由覆盖人工翻译。

### fuzzy 与 obsolete 状态

fuzzy/obsolete 标记表达翻译是否可用、message 是否仍在 source 中，直接影响 catalog 完整性和运行结果，不能归入纯行号元数据。

计划内 message 删除或 identity 变化可能使状态由权威 extraction 产生，但计划必须显式预期并审查。新增 fuzzy、已有有效翻译变为 fuzzy、意外 obsolete、obsolete 复活或清理策略变化均须暂停，除非它们正是已确认目标的一部分。

### Catalog 边界

计划必须列出由当前 Lingui 配置与项目入口确定的完整 catalog 文件集合，并区分 source locale 与翻译 locales。允许闭包只发生在该集合内；新增 catalog、locale、目录、配置输出或未声明格式文件属于范围变化。

“完整边界”不等于“接受边界内一切 diff”。每个 catalog 内仍按 `#:`, `#.`, `msgid`, `msgstr` 和状态字段分别验收。

### 二次 extraction stability

首次 extraction 用于把源码、comments 和 references 投影到 catalogs；计划内翻译补充随后完成。最终再次使用同一权威入口时应满足：

- catalog 不产生新的结构 diff 或反复行号变化；
- 计划内 `msgid`、translator comments 与 source references 保持正确；
- 已有和新补的 `msgstr` 均被保留；
- 不新增 fuzzy/obsolete drift；
- catalog 边界不扩大。

二次 extraction stability 是生成链闭合证据，不是用手工恢复元数据制造“无 diff”。若 stability 失败，必须定位生成输入、配置或人工编辑与 generator owner 的冲突。

## 计划写作约束

涉及权威生成器的后续计划必须：

- 声明当前项目的权威入口、输入 owner、完整生成物边界和允许的人工补充边界。
- 按字段或语义类别描述预期结果，例如“新增已确认 messages、保留既有翻译、允许 source references 按当前树归一化”。
- 把首次生成后的结构化 diff 审查与人工补充后的二次 stability 分开描述。
- 为语义字段、状态字段、边界外输出和非确定性 drift 保留明确暂停条件。
- 允许计划内生成物边界中的确定性 metadata closure，但要求记录其来源与非语义证据。

计划不得：

- 把预计 hunk、旧行号、旧 source-reference 集合或 diff 行数作为权威输出白名单。
- 使用“只含本功能 refs”排除同一权威 extraction 对既有陈旧 references 的确定性归一化。
- 用“generated file 可全量接受”取代字段级审查。
- 要求执行者手工恢复生成器拥有的元数据以保持计划编写时的 diff 形状。
- 把二次 extraction 的稳定性失败降级成可忽略噪声。

## 验收设计

### Owner 与结构验收

- 全局 `AGENTS.md` 不增加 Lingui 或 generated metadata closure 细则。
- 通用继续/暂停算法只存在于 `$managing-work-stages` 的阶段 reference。
- 计划表达约束只存在于 `$project-doc-workflow` 的 plan contract。
- Lingui 字段分类、catalog 边界与 stability 只存在于项目级 `$lingui-catalog-workflow`。
- `codex-gui/AGENTS.md` 只有一条领域路由，不复制详细协议。
- 新项目 skill 位于 `.codex/skills/**`，不进入第三方 `.agents/skills/**`，并能通过项目规定的 skill 结构验证。

### 正向案例

- 新增两个计划内 `msgid`，同时更新两个声明 catalogs 中既有 `#:` 行号；既有 `msgid`/`msgstr` 与状态保持不变，二次 extraction 稳定。结果应记录 metadata closure 并继续。
- 同一 message 新增准确的 translator comment 与新的 source reference，翻译保持不变。结果应在字段审查后继续。
- 源码格式化导致 catalogs 内 references 全量重定位，但没有语义或边界变化，重复生成稳定。结果不应因 hunk 数量超出预计而重新计划。

### 负向案例

- extraction 意外新增 locale catalog 或修改 Lingui 配置输出。结果必须暂停。
- 既有 `msgid`、`msgstr`、placeholder、fuzzy/obsolete 状态发生未计划变化。结果必须暂停。
- 首次生成看似只有行号变化，但二次 extraction 继续抖动或覆盖人工翻译。结果必须暂停并定位 owner 冲突。
- 计划只写“接受 generator 输出”而没有字段级语义验收。计划不得通过确认门禁。

### 保真验收

- 当前根因检查、范围检查和稳定性检查仍然存在；本设计不新增 ignore、skip、baseline 修改或自动接受机制。
- 执行者仍须审查完整 generated diff；变化较多不等于错误，generated 也不等于正确。
- 只有字段分类和稳定证据证明非语义闭包时才继续，无法分类或无法稳定时默认暂停。

## 风险与控制

### 把 metadata closure 误解为自动放行

控制：继续条件使用全条件合取，并要求字段分类、完整 diff 审查、生成物边界与二次稳定性；任何语义字段或状态字段 drift 都阻断。

### 通用 owner 吸收领域细节

控制：`$managing-work-stages` 只定义结果级继续/暂停条件；Lingui 字段与 catalog 结构全部由项目级 skill 拥有。

### 计划失去精确范围

控制：禁止的是 hunk 级预测，不是文件边界。计划仍须列出完整生成物集合、输入 owner、人工编辑边界和每类语义验收。

### 第三方 skill 被本地定制

控制：所有新增细则进入项目手工 skill；`.agents/skills/**` 和官方 skills 保持只读、不变。

## 明确排除范围

- 不修改 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 或其 `~/.codex/AGENTS.md` 别名。
- 不修改 `/Users/jiangsheng/cnb/codex-config/.agents/skills/**`、`/Users/jiangsheng/cnb/codex/.agents/skills/**` 或任何 OpenAI 官方 skill。
- 不修改 Lingui 配置、package scripts、catalog schema、locale 集合或 extraction 行为。
- 不修改当前 selected-skill display 的 production、tests、catalog 或计划文件。
- 不继续当前 feature 的翻译、格式化、测试、GUI 验收、stage 或 commit。
- 不新建平行的通用生成器 skill，不把项目领域协议复制进全局提示词。
- 不创建 implementation plan；设计落盘并经用户确认后，才可另行进入计划阶段。

## 后续阶段门禁

本文档落盘只完成设计记录。用户确认本文档后，才可以创建 implementation plan。计划必须分别处理 Codex 与 `codex-config` 的 canonical 写入和 Git 边界，并在实施前满足相关工作文档独立本地提交门禁。
