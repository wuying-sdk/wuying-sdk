# 文档站维护与发布

## 内容维护

- `docs/` 是 Mintlify 文档根目录，`docs.json` 是导航与品牌配置。
- SDK 定位为无影对外集成能力的统一入口，面向资源管理、资源内操作系统操作与 Agent 集成。AI 云电脑是当前重点；介绍整体范围时，区分演进方向与当前已交付接口，不能将 Agent 接入模型套用于所有资源或把规划写成已支持。
- 阅读路径为“SDK 简介 → 授权与认证 → 安装准备 → 初始化 Client → 首次任务 → 任务指南/领域模型/参考”，保留无影领域对象及各语言、移动平台的差异。
- 顶部采用 Docs、Guides、SDK Reference、API Reference、Changelog、FAQ 六类。Docs 中授权与认证、SDK Client 为独立入口；领域模型解释放在 Docs，具体任务放在 Guides，SDK Reference 按语言查接口，API Reference 按模型及操作查接口。
- 先区分受信任服务端的签名云 API 身份和终端用户的业务身份；运行在服务端不自动变成 AK/SK 模式。各语言的签名入口以当前公开 API 为准，不用内部路径补造统一接口，不把 STS/Provider 当作本包已经支持的参数。
- 修改 SDK API 时，同步对应指南、参考表和可运行示例。先确认根包公开导出，不从内部路径导入。
- 入门指南只承诺已核实的运行能力。包能导入不代表消息、附件或流化链路在所有环境都可用。
- 安装命令应对应实际交付的 SDK 包；公开 npm 发布后，再核对并替换安装步骤。
- 凭证、客户数据、内部地址、源码检出和 SDK 制品不得复制进文档目录。客户 Skill 的 Markdown 指令及 references 可按明确清单提供文本和下载包，不包含可执行实现或凭据。

## 引用交付文档

本站选取客户交付文档作为指南输入，将 Markdown 链接转换为站内路径，补充网站首页、支持页面和必要的当前实现边界说明。已生成的指南与参考通过 `reference-content-manifest.json` 记录原文及产出哈希；文档工作区内容与 SDK 提交分别追溯，不将未提交交付文档冒充上游提交内容。

维护者可从指定输入重新生成：

```bash
python3 scripts/import-reference.py \
  --reference-docs /absolute/path/to/runtime-manager-inputs/docs \
  --draft-archive /absolute/path/to/runtime-manager-contract-inputs.zip \
  --sdk-source-commit b9b83c444a9663ed0d41551932af9661f6615e4f
```

导入器投影选定的对客文档、14 个示例文本、一个公开类型声明，以及客户明确要求的两项 Skill 指令和下载包。它不提取四种 SDK 源码树、完整 Shell demo、构建产物、授权材料、审查报告或历史诊断记录。HTML 示例以 `.txt` 文本提供，不在站点执行。其链接是阅读入口，实际编译运行仍依赖完整语言交付包。

修改生成页面时，应修改输入文档或导入器中明确的站点适配，再重新导入；首页和其余手工页面独立维护。输入文档的通用错误/能力边界不因转换而扩展。更新输入基线后重新核对链接、类型和验证证据。

客户 CLI Skill 以仓库 `wuying-sdk-cli/skills/` 为唯一内容源。导入器从同一源码归档中仅提取两项 Skill 的五份 Markdown 文件，逐文件记哈希并生成确定性 ZIP；站点不维护第二份指令。安装与更新指南是 `docs/guides/cli-skills.mdx`，CLI 包含 Skill 和自动安装器。

文档页面和维护源码统一由 GitHub `wuying-sdk/wuying-sdk` 仓库管理，`docs/` 为 Mintlify 发布根目录。推送前检查完整变更、同源快照与生成结果；文档更新不等于 SDK 制品发布，SDK 的许可证、组件再分发授权及版本发布按 SDK 仓库流程确认。

## 文档体验规范

本轮优化参考 [E2B 首页](https://docs.e2b.dev/) 的短代码和语言切换、[Diátaxis](https://diataxis.fr/) 的教程/任务/参考/解释四类阅读需求，以及 [Google 代码示例指南](https://developers.google.com/style/code-samples) 的引导语、语言风格和窄屏可读性。以下是本站采用的维护约定：

| 阅读需求 | 本站做法 | 更新时核对 |
|---|---|---|
| 快速认识产品 | 首页简述统一定位和能力范围、说明认证路径，再给六种方式的 Client 初始化示例 | 第一段代码之前不堆叠导航卡片；不虚构 API 或公开安装命令 |
| 完成首次接入 | 说明目标、前提、输入、核心代码、完整运行入口和预期结果 | 占位值与真实 ID 区分，明确会真实发任务的开关 |
| 解决具体任务 | 每页聚焦一个结果，代码示例连接对应指南 | 说明快照形状、生命周期和相关错误恢复，不隐藏宿主函数 |
| 查方法或理解模型 | SDK Reference 保存精确签名，领域模型解释职责和关系 | 示例链接参考，不复制第二套完整 API 表 |
| 持续维护 | 首页与初始化页复用 `docs/snippets/client-initialization.mdx`；首次任务使用 `docs/snippets/first-task.mdx`，认证模型在 `docs/snippets/authentication-model.mdx` | 从实际声明/源码校验；修改共享片段后检查所有引用页 |

短例只展示必要的核心语句，不包裹额外函数或类；外部输入在代码前简短说明，不冒充可直接执行的完整程序；完整 Demo 通过源码阅读入口和语言安装指南配套提供。TypeScript 的 Context、Client 和回调参数显式列出；Go/Java 保留本语言错误与异步机制。请求身份由宿主预先保存，超时不代表远端取消。

新增或更新示例，至少做同版本类型/编译检查、页面构建、站内链接检查；凭证可用且允许执行业务时，再补真实端到端结果。编译与页面返回 200 不等于视觉验收或真实收发通过。浏览器验收检查语言切换、复制、长行横向滚动、移动端和明暗主题。

## 预览与校验

API Reference 按当前交付的公开入口自动生成全量清单。`scripts/api-models.json` 只补充已有条目的中文标题、语义与稳定地址，不再作为限制接口数量的白名单。输入包括 JS 根导出及 Client 返回的 Manager（含继承）、Go 非 internal 公开业务库包、Java public 签名（含 SDK 层继承）和 CLI 全部静态注册命令。

```bash
npm run docs:generate-api
npm run docs:check-api
```

生成器只编辑其记录的操作页、语言/类参考、索引和相关导航；手工改动生成页、无主页面及符号链接会拒绝覆盖。签名由 TypeScript 编译器 API、Go AST/编译器方法集、Java public 签名和 CLI 注册结构提取；本目录不定义新 SDK 方法或 HTTP 路由。接口参考直接展示全部真实签名及重载；入门示例只展示核心业务调用，不再生成额外的 Parameters 包装函数。每次输入变化检查生成示例类型、覆盖、构建与链接。

SDK Reference 使用原生语言下拉切换 JS/TypeScript、Go、Java、Android、iOS、CLI，每个选择下展示相应类/接口、完整公开清单和原始契约。API Reference 按模型合并可明确匹配的操作，语言间未匹配的名称或合同仍保留，不凭同名猜测等价。构造、配置、DTO/错误辅助、回调契约完整保留在语言清单，避免把它们当作资源操作。

`api-coverage.json` 逐项记录公开成员/命令与其文档落点；统计按语言入口和成员，包含重载/别名时不等同于独立业务 API 数量。全量指本基线已交付的公开调用合同，不包含私有实现、非 public 编译类、测试/示例/工具或规划能力，也不意味着已完成每个接口的在线验收。

变更交付 SDK 后，先重新导入对客文档，再更新签名快照（需要 Go、Node 与 JDK 11+，仅解析和编译，不执行 SDK 业务）：

```bash
python3 scripts/snapshot-public-api.py --draft-archive /absolute/path/to/runtime-manager-contract-inputs.zip
npm run docs:generate-api
npm run docs:check-api
```

Go 快照使用隔离解压的源码，AST 提取与 Go 编译器公开方法集必须一致，覆盖公开别名/提升方法；CLI 只静态分析注册和选项；Java 注解快照记录源输入与废弃标注。`scripts/public-api-inputs/` 只保存这些契约数据和来源哈希，不保存 SDK 实现源码。当前公开签名可含未支持的方法，按能力与明确状态分别说明，不能从覆盖率推断可用性。

`api-operation-manifest.json` 记录声明、目录及生成内容哈希。与客户原文导入的 `reference-content-manifest.json` 分开维护。先执行原文导入，再运行模型操作生成器。新增 API 模型时同步领域职责、签名、能力边界及导航，不添加未经确认的 HTTP method/path 或默认成功结果。

```bash
npm ci
npm run docs:validate
npm run docs:links
npm run docs:dev
```

新增页面后，更新 `docs/docs.json` 并验证所有站内链接。首次上线与结构改动还应在浏览器检查导航、移动端、明暗主题和代码复制。

## 连接 GitHub

1. 登录 Mintlify，在站点控制台连接 `wuying-sdk/wuying-sdk`。
2. 将文档目录配置为 `docs`，生产分支选择实际用于发布文档的分支。
3. 安装或授权 Mintlify GitHub App，仅选择该仓库。
4. 在生产分支合入一项文档修改，确认部署成功并检查线上内容。

本地文件准备不等于 GitHub 已同步，也不等于 GitHub App 已授权。首次推送前需要检查精确文件清单和仓库目标。

## 临时站点与认领

Mintlify 的 Agent 发布流程可以在未登录的情况下建立临时站点。站点在创建后 24 小时内需要由用户通过认领页面登录并确认；未认领的站点会过期。以发布回执的具体到期时间为准。

认领时应使用项目长期维护账号。站点认领和 GitHub 组织是两套独立的账号归属，认领不会自动转移 GitHub 仓库。

临时站点写入凭据仅用于发布进程，不保存到源码、Git remote URL 或文档。后续将仓库连接到已认领站点，可由 Git 同步更新文档。

## 自定义域名

先在 Mintlify 控制台登记实际拥有的域名，再按控制台给出的 DNS 记录配置和验证。域名未确认前使用平台默认地址。

## 资料

- [Mintlify 快速开始](https://www.mintlify.com/docs/quickstart)
- [Agent 发布与认领](https://www.mintlify.com/docs/cli/agent-signup)
- [全局配置](https://www.mintlify.com/docs/organize/settings)

## Android / iOS 参考维护

当前是 RuntimeManager 首版未提交草稿。基础 SHA 不是完整源码身份，输入归档含 `DRAFT_PROVENANCE.json`、基础提交和逐文件 SHA-256；导入器校验归档清单及全部文件哈希。移动与其他语言均使用同一归档，不把实现源码或原生二进制复制到本站。干净提交的旧快照模式仍可用于匹配该提交的文档，不能用来更新本次工作区草稿。

```bash
python3 scripts/snapshot-mobile-api.py --draft-archive /absolute/path/to/runtime-manager-contract-inputs.zip
npm run docs:generate-api
npm run docs:check-api
```

快照保存来源文件哈希，要求 Java/Swift 的全部 Methods 常量与 Go mobile/api.json 一一匹配。生成器将各方法映射到已有模型操作；两端方法常量数量以当前 Go 注册表实算与主语言公开成员/构造/DTO 数量分别统计，记录于 api-coverage.json 的 mobile_bindings。移动 Client 与事件声明摘录、安装和生命周期为手工维护页，修改时需对照同一哈希归档内的源文件并独立审查。

SDK Reference 使用六个原生下拉入口。移动模型目录、导航和覆盖纳入现有生成哈希与拒绝覆盖检查；各语言统计重新从当前声明计算。验证源码/文档不代表 AAR/XCFramework 构建、JNI/ObjC 启动或真实移动业务验收。

API Reference 的模型分组采用英文模型名，操作标题直接使用当前公开声明中的真实方法名或命令。多语言共用页优先以 JS/TypeScript 公开绑定命名，没有该绑定时保留代表语言的原名；页面内仍列出各语言的完整签名与大小写差异。移动端方法标题使用原生 Methods 常量，页面说明保持原有语言。不要为接口名称另建翻译表。

## 领域模型与父子模块

`content/domain-model/*.mdx` 是本站领域说明的唯一编辑源，`content/domain-model/navigation.json` 是该区导航来源。导入器将它们投影到 docs/domain-model 并记录来源与输出哈希，避免重导入客户文档时恢复合写章节。编辑内容源后运行原文导入和 API 生成；不要直接维护渲染副本，导入器会拒绝覆盖被修改的领域投影。

每页只介绍一个领域，列出职责、相关类型、生命周期、操作入口与边界，不复制完整 API 参数。领域说明按云资源、AI 能力、存储能力和计量组织；父子目录不是继承、持久化所有权或新增 SDK 工厂。Client 统一在开始使用的 SDK Client 页面介绍，API 模型链接指向该唯一页面，旧领域 Client 页面不再生成。

领域模型导航使用中文说明词：Overview 显示为“概览”，云能力、数据与同步、操作与恢复使用中文；Client、Runtime、Agent、Conversation 等领域术语及真实类型、方法名保留原文。本轮仅调整中文导航措辞，不声明已提供英文正文或语言切换。

共享 Client 初始化 CodeGroup 覆盖 TypeScript、Go、Java、Android、iOS、CLI；首页、SDK Client 与 Client.create 复用同一片段。移动短例只保留用户票据、应用身份和私有数据库文件，不伪造服务端签名入口；最低平台与原生制品、线程和账号隔离要求在片段周围说明。原生编译/设备验收与文档构建分别记录。

## RuntimeManager 草稿来源

重新导入时，将输入目录与 SDK 源码工作区分别指定为本机实际路径；例如 `/absolute/path/to/sdk-customer-inputs` 与 `/absolute/path/to/wuying-sdk`。原交付目录只读。`sdk_source_commit` 始终表示基础提交；`sdk_source_state` 标记未提交草稿，`source_archive_sha256` 表示实际快照。源码变化后重新构建声明、更新归档及哈希，再按上面的导入、主语言快照、移动快照和生成顺序运行，不修改旧归档的历史验证记录。

首版不保留 CloudAgentManager 工厂或 AgentManager 中的 Runtime 方法；RuntimeManager 使用同一根 Client。底层云 Action 与资源 ID 语义不变；重复公开列表及其专用 DTO 已移除，统一 listRuntimes 的 Snapshot 合同。

## 能力分类与集成指南

业务模型的四类划分为云资源、AI 能力、存储能力、计量，权威导航为 `content/domain-model/navigation.json`。API Reference 从该导航推导分类，不维护另一份分类表；Client 与认证单列。Message 下介绍 CommandReceipt 和 MessageStream，Conversation 下介绍 Mutation，Client 下介绍 Subscription。目录嵌套仅表达阅读归属，不新增 SDK 成员或改变工厂归属。

CLI 专属命令仅放在 SDK Reference 的 CLI 下；Mobile 是 Go mobile 的原生桥接，位于 Go 的“移动桥接（高级）”，Android / iOS 通过移动合同链接查阅，普通应用优先使用原生 Client 与 Methods。会话同步和 Transport 仅为 SDK 内部实现，不进入客户导出、原生方法常量或对客文档。生成器拒绝将其收录为客户操作。生成器保留每项操作原有地址和完整语言覆盖，并校验操作在业务目录或专属 SDK 目录中恰有一个归属；API 总数包含移入 SDK Reference 的入口，不等同于业务 API 数量。

结果读取、同步、监听、回执与恢复是共用接入方法，导航由 `content/domain-model/guide-navigation.json` 管理并投影到 Guides。内容沿用原站内地址以保留既有引用，标题按读者任务命名，类型名保留在正文和 SDK Reference。全部领域 canonical 页面必须在上述两份导航中恰好出现一次；导入器记录并替换其拥有的 Guides 分组，拒绝覆盖同名的非拥有分组。

端口服务当前只说明 RuntimeManager.generateSceneUrl 的已交付能力，不新增 PortServiceManager、端口枚举、监听或转发接口。更改阅读分类不改变实际 SDK 合同或语言支持。


## 开始使用与唯一 Client 页面

Docs 的开始使用导航按“介绍 → 快速开始 → 授权与认证 → SDK Client → 联系我们”组织。快速开始包含创建桌面并通过 AuthCode 完成 Agent 对话、ASP（Node / CLI）、远程脚本启动应用、脚本启动 HTTP 服务并通过端口服务交互四个示例；各页只保留当前任务的必要调用，完整参数链接到 API Reference。

`docs/getting-started/initialize-client.mdx` 是 Client 介绍的唯一编辑源和页面，合并 Client/Manager 职责、管理员/用户态初始化、订阅与关闭、账号隔离和调用期限。领域模型不再另列 Client；导入器跳过旧交付章节 `domain-model/01-client.md`，将其引用映射到 SDK Client，API 生成器使用同一页面。不要重新新增 `content/domain-model/01-client.mdx`。

`docs/support/contact.mdx` 提供项目联系入口和团队二维码占位；正式团队二维码由维护方后续补充，不生成或冒用联系二维码。四个快速示例及联系页由本站手工维护，不属于交付文档导入输出。


API Reference 的逐操作用途由 `scripts/api-descriptions.json` 维护；生成器要求每项公开操作恰有一份中文用途，缺失或多余条目都中止生成。用途投影到页面 description 和“接口用途”正文，原始方法名、签名、参数与权限约束保持不变。新 API 与用途说明同批维护。

快速开始的 Node ASP 示例启动当前 CLI 浏览器播放器；不声称 AspManager 在纯 Node 渲染。端口服务示例以预配置 HTTP Feature 为前提，不伪造端口创建 API。随站点附带的 run-script.mjs 与 echo-server.py 为演示源码文本，分别负责等待真实脚本终态和接收 HTTP 消息，不执行于文档站点本身。

默认创建的 SDK 源输入和公开声明与文档同批更新：Node/Go/Java和CLI复用服务端default网络，按DescribeBundles目录校验4核8GiB Windows Server 2025，不回退其它系统或规格；显式模板与等待选项保持原合同。零参资源创建不自动分配用户，AuthCode对话demo仍显式指定用户。

通用操作示例采用 TypeScript、Go、Java、Android、iOS、CLI 六个入口的 CodeGroup。共享操作位于 `docs/snippets/demo-*.mdx`；调用页只组合这些组件。缺少真实入口的语言卡片使用明确的能力说明，不能伪造方法或将用户态升级为管理员。安装、指定宿主配置、协议 JSON、签名与类型定义保留自身用途；语言专用块按内容哈希列入 `scripts/example-language-policy.json`，新代码块不自动豁免。运行 `npm run docs:check-examples` 核对覆盖，`--write` 只刷新报告。

服务启动示例发送同一份 `start-echo-service.ps1`，Node/Go/Java 的 demo helper 等待完成并释放本地订阅；Go/Java helper 是文档配套源码，不是 SDK 新增入口。未知结果保留 invokeId，使用结果订阅核对，不自动重发脚本。

首版客户声明剔除底层 POP CloudClient/doRPC、IM Admin 及 ConversationManager 的 IM 管理扩展、根 Client 的 getIMCredentials/refreshLogin。Java 按 internal 命名空间、引用 internal 类型的装配签名和 @hidden 标记排除；TypeScript 构建通过 stripInternal 移除内部预检声明。内部签名、认证续期、SDK自带CLI预检及AK/SK桌面业务保持原owner，生成器对内部入口重新泄露直接报错。原始Java参考是客户支持合同清单，不等于所有JVM public字节码成员。


首版客户源码不提供底层群目录、显式群同步或 Transport 门面；公开签名、移动注册表与文档从同一输入归档生成。SDK 内部保留同步实现，Gateway 使用其固定 vendor 依赖，本次不替换该依赖。旧对客操作页与导航随公开声明删除；不能仅以隐藏页面代替源码边界收敛。

移除显式同步后，普通会话读取、订阅和发送由内部按需激活冷历史；已验证的热数据与离线缓存不重复激活，独立历史查询不要求 Runtime 在线。相关行为以源码首版对客边界与冷会话回归为证据。

2026-11-17：移除尚未落地的通用资源目录与会话资源选择设计；方法、模型、能力标记、原生注册表与文档同步删除。ResourceManager 继续提供附件与工作空间实际能力；生成器拒绝重新收录已删除的预留方法。

2026-11-17：移除重复 Mutation 查询与订阅入口，统一为 CommandReceipt。MutationOptions.mutationId 保留写入身份；查询时使用相同值作为 clientCommandId。内部操作记录、重启恢复、未知状态和问题答复身份校验保持原合同。

## 能力地图插图

能力地图正文由 `content/domain-model/00-overview.mdx` 维护，导入器投影到 `docs/domain-model/00-overview.mdx`。插图由 `python3 scripts/render-capability-map.py` 生成桌面/窄屏、浅色/深色四份 SVG；页面使用 picture/source 的同域响应式图片（桌面与窄屏均显式指定 source），模型链接保留在下方的“查看能力与模型入口”。插图只概括能力分类与用途，具体接口、认证及平台支持仍以模型页为准。更新类别或文案时同步插图与正文，再检查四种布局。

会话执行配置的 API 目录统一放在 `Conversation → Config` 下，与 Docs 的“会话 → Config”层级一致；导航调整不改接口名称、参数或已有页面地址。

2026-11-18：附件与工作空间分别使用 AttachmentManager/buildAttachmentManager 与 WorkspaceManager/buildWorkspaceManager；草稿附件归附件入口。旧 ResourceManager/buildResourceManager 不保留别名。原生 JSON/Methods 同步为 attachment.* 与 workspace.*，方法参数与底层 Gateway 协议不变。
