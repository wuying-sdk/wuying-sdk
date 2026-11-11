# Wuying SDK documentation

无影 SDK 的对外文档站源码。当前仓库内容为文档、示例文本、公开类型参考和 CLI 配套 Skill；SDK 源码与安装制品另行交付。

## 本地预览

要求 Node.js 20.17 或更新版本。

```sh
npm ci
npm run docs:dev
```

```sh
npm run docs:validate
npm run docs:links
```

## Mintlify

- 文档配置：`docs/docs.json`
- 文档目录：`/docs`
- 生产分支：`main`

在 Mintlify 的 Git Settings 中连接本仓库，并授权 Mintlify GitHub App 访问本仓库。配置文档位于子目录后，将目录设为 `/docs`。

接口与语言支持范围以文档中的版本基线和覆盖清单为准。当前参考包含未提交的 SDK 首版草稿，不代表对应 npm/Maven/移动端制品已经正式发布。

CLI 配套 Skill 安装与使用见 `docs/guides/cli-skills.mdx`。
