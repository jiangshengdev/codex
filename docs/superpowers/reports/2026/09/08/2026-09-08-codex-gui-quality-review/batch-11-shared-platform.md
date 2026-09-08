# B11 公共设施、国际化与共享样式

基线：`63762612e56d332f474a5ba3861b22be761f0479`。状态：静态主审与独立复核完成。

## 覆盖方法

覆盖清单 B11 共 21 文件：qrAccess 4、feedback 5、identity 2、subscriptions 2、text 3、i18n 1、locale catalogs 2、共享 CSS 1、favicon 1。

实现与测试按行为读取，PO 按消息键、译文及加载链检查，SVG 按静态资源结构检查；不声称逐个 SVG 滤镜做视觉验收。没有运行提取、编译、格式化或生成命令。

本批未发现证据充分的独立缺陷或结构整改项。

## 七维结论

| 维度 | 检查依据与结论 |
| --- | --- |
| 行为 | `qrAccessUrl.ts` 使用权威路由和 token fragment key，仅当前任务与历史详情生成访问 URL；无 token、新建草稿与历史列表不生成 QR。token 经 URLSearchParams 编码。 |
| 状态与生命周期 | QR URL 依赖当前 props memo；listenerSet 明确 live Set、异常立即传播、clear 后仍能订阅的契约，测试覆盖重入、增删、独立实例和抛错后可用性。它不自称持有调用方生命周期。 |
| 恢复 | 诊断信息由辅助 modal 承载，内容原样作为 React children；没有删除原始失败内容或替换为静默成功。存储/连接恢复本身由领域 owner 负责。 |
| 契约与安全 | UUID 从 getRandomValues 生成并固定 version/variant bits，可用于普通 HTTP origin；QR 将既有授权显式分享给用户，不自动发送到外部服务。生成 URL 的线程标识来自上游合法路由。 |
| 性能 | grapheme 裁剪遇首个超额分段即返回，不遍历完整长文本后再截断；listenerSet 无持久副本。CSS 无 JS 布局循环，本批未测真实帧率或 GPU 成本。 |
| 职责与维护性 | grapheme 工具不附加省略号或归一化，由调用方决定展示；failure layout 用容器布局适配内容/动作，诊断 modal 独立于各错误 owner；未因样式规则数量提出拆分。 |
| 测试 | UUID 测试验证两端随机字节的版本位；grapheme 测试覆盖 CJK、ZWJ、组合字符及零预算；反馈 Browser 测试检查 DOM 结构、焦点返回、长文本滚动、卸载和按钮高度；QR 测试核实中文文案同时保留原始 URL。测试仅静态阅读。 |

## 国际化检查

`i18n.ts` 解析 navigator locale，按明确 en/Hans/Hant/region 策略选择两种支持语言；不将不支持繁体直接 fallback 英文视为未获产品要求的缺陷。main 先加载并激活 catalog，再挂载 React，html lang 同步更新。

只读解析两份 PO：各 261 条非空消息键，键集合相同，中文译文无空项，英文译文与消息文本一致。结合译文检查动态值及富文本占位符；这不是 Lingui 编译或运行验收，也未重新提取以证明 source-reference 无漂移。未发现具体遗漏或改变交付语义的译文问题。

## 排除与验证边界

- listenerSet 不隔离 listener 异常是明确契约与现有测试行为，不能建议吞错以“增强稳定性”。
- grapheme 的合法预算由调用方负责，当前调用均使用声明的非负预算；未为纯内部参数假设添加运行防御建议。
- QR 展示当前完整访问 URL 是产品功能，未在本报告记录真实运行 token；测试使用的固定 token 不构成真实验收。
- 视觉、响应式、焦点的 Level 1 Browser Tests 本轮未运行；Level 2/3 未执行，不由 CSS 阅读替代。

## 交接

X03 使用本批诊断和共享反馈边界核实错误传播。国际化相关 source macro 覆盖由其业务文件主批检查，工程提取配置归 B13；本批目录覆盖不等于独立执行全项目翻译扫描。
