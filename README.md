# Wuying SDK

无影 SDK 的开发者文档预览，覆盖 Go、Java、JavaScript / TypeScript、Android、iOS 与 CLI。按快速开始、任务指南、领域模型、SDK Reference 和排障组织。

## 本地预览

需要 Node.js 20.17.0 或更新的受支持 LTS 版本。

```bash
npm ci
npm run docs:dev
```

打开终端输出的本地地址。文档内容位于 `docs/`，导航、品牌颜色和页面配置位于 `docs/docs.json`。

## 检查文档

```bash
npm run docs:validate
npm run docs:links
```

文档示例面向同版本 SDK 交付包。文档站依赖与 SDK 运行依赖分别维护，本站不包含 SDK 源码树、安装制品或完整 Shell demo。参考声明与示例仅提供文本视图，实际运行使用维护团队提供的完整同语言交付包。

本地预览不代表公开发布已批准。源码、许可证、内嵌组件授权与正式分发入口继续按原交付的发布前决定确认。

## 发布

参阅 [文档站维护与发布](DOCUMENTATION.md)。

## 许可证

SDK 源码与文档的最终开源许可证尚待统一确认；本次文档站准备不替代许可证确认。

## 当前接口草稿

当前预览对应 RuntimeManager 首版未提交源码草稿。环境目录、能力与云资源操作统一进入 RuntimeManager；AgentManager 不含 Runtime 方法，旧 CloudAgentManager 入口已移除。完整来源、覆盖和制品限制见[覆盖清单](docs/api-reference/coverage/index.mdx)与[移动合同](docs/reference/mobile/contract.mdx)。

## 工程结构

- `docs/`：Mintlify 发布根目录，包含导航、品牌素材、指南与生成的接口参考。
- `content/domain-model/`：领域模型的维护原稿，由导入器投影到 `docs/`。
- `scripts/`：接口快照、文档生成、覆盖检查及示例语言检查工具。
- 根目录 `*-manifest.json`、`*-coverage.json`：记录同一来源的声明、输入哈希与生成覆盖。

日常变更先修改维护原稿或生成器，再运行相应生成步骤。直接核验当前快照可以运行：

```bash
npm ci
npm run docs:check-api
npm run docs:check-examples
npm run docs:validate
npm run docs:links
```

完整重新导入还需要同版本 SDK 源码归档和对客文档输入；来源与步骤见 [维护说明](DOCUMENTATION.md)。仓库中保留的基础提交和归档哈希描述生成时的输入，不将其当成最新 SDK 制品已发布的声明。
