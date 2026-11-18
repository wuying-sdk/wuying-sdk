#!/usr/bin/env python3
"""Render a selected customer-documentation snapshot as local Mintlify pages.

No SDK source, binary, demo, Git history or remote publishing is imported.
"""
import argparse
import hashlib
import json
import re
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--reference-docs', required=True, type=Path)
parser.add_argument('--draft-archive', required=True, type=Path)
parser.add_argument('--sdk-source-commit', required=True)
parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
args = parser.parse_args()
reference = args.reference_docs.resolve()
project = args.project.resolve()
docs = project / 'docs'
sdk_commit = args.sdk_source_commit
if not re.fullmatch(r'[0-9a-f]{40}', sdk_commit):
    raise SystemExit('Expected a full SDK source commit')
for language in ['go', 'java', 'js', 'cli']:
    if sdk_commit not in (reference / (language + '.md')).read_text():
        raise SystemExit('Language guide does not match the selected SDK commit: ' + language)

pages = {
    'getting-started/overview.md': 'getting-started/overview',
    'getting-started/first-conversation.md': 'getting-started/first-conversation',
    'guides/README.md': 'guides/index',
    'guides/streaming.md': 'guides/streaming',
    'guides/interactions.md': 'guides/interactions',
    'sdk-reference/README.md': 'sdk-reference/index',
    'support/troubleshooting.md': 'support/troubleshooting',
    'reference/go/API.md': 'reference/go/api',
    'reference/java/API.md': 'reference/java/api',
    'reference/cli/COMMANDS.md': 'reference/cli/commands',
}
for path in sorted((reference / 'domain-model').glob('*.md')):
    # Client has a single, hand-authored home under Getting started.
    if path.name == '01-client.md':
        continue
    pages[path.relative_to(reference).as_posix()] = path.relative_to(reference).with_suffix('').as_posix()
for path in sorted((reference / 'integration').glob('*.md')):
    pages[path.relative_to(reference).as_posix()] = path.relative_to(reference).with_suffix('').as_posix()
for language in ['go', 'java', 'js', 'cli']:
    pages[language + '.md'] = 'sdk-reference/' + language

extra_routes = {
    'README.md': 'index',
    'index.md': 'domain-model/00-overview',
    'testing.md': 'support/validation',
    'reference/js/NodeJS-SDK-API-V3.md': 'reference/js/api',
    'reference/js/JS-新版交互接入.md': 'domain-model/07-interaction',
    'reference/js/JS-OpenIM退役与迁移.md': 'support/migration',
    'reference/cli/CONTRACT.md': 'integration/04-errors-and-operations',
}
route_by_path = {(reference / name).resolve(): '/' + route for name, route in {**pages, **extra_routes}.items()}
route_by_path[(reference.parent / 'README.md').resolve()] = '/getting-started/overview'
route_by_path[(reference / 'domain-model/11-cloud-capabilities.md').resolve()] = '/domain-model/00-overview'
route_by_path[(reference / 'domain-model/01-client.md').resolve()] = '/getting-started/initialize-client'

examples = [
    'examples/go/go.mod', 'examples/go/go.sum', 'examples/go/main.go',
    'examples/go-workflow/go.mod', 'examples/go-workflow/go.sum', 'examples/go-workflow/main.go',
    'examples/java/ReadOnlyExample.java', 'examples/java/WorkflowExample.java',
    'examples/js/browser.html', 'examples/js/conversation-workflow.mts',
    'examples/js/package.json', 'examples/js/read-only.mjs',
    'examples/js/scripts/patch-idb.mjs', 'examples/js/workflow.mjs',
]
source_hashes = {}
source_state = {"kind": "commit", "base_commit": sdk_commit}
downloads = {}
with zipfile.ZipFile(args.draft_archive) as archive:
    top_levels = {name.split('/')[0] for name in archive.namelist()}
    if len(top_levels) != 1:
        raise SystemExit('Expected one archive root')
    prefix = next(iter(top_levels)) + '/'
    if prefix + 'DRAFT_PROVENANCE.json' in archive.namelist():
        state = json.loads(archive.read(prefix + 'DRAFT_PROVENANCE.json'))
        if state.get('kind') != 'uncommitted-runtime-manager-draft' or state.get('base_commit') != sdk_commit:
            raise ValueError('Draft provenance differs from the selected base')
        declared = state['source_sha256']
        members = archive.namelist()
        if len(set(members)) != len(members) or set(members) != {prefix + name for name in declared} | {prefix + 'DRAFT_PROVENANCE.json'}:
            raise ValueError('Draft source inventory mismatch')
        for name, digest in declared.items():
            if Path(name).is_absolute() or '..' in Path(name).parts or hashlib.sha256(archive.read(prefix + name)).hexdigest() != digest:
                raise ValueError('Draft source hash mismatch: ' + name)
        source_state = {key: state[key] for key in ['kind', 'base_commit', 'compatibility', 'publication']}
        source_state['provenance_sha256'] = hashlib.sha256(archive.read(prefix + 'DRAFT_PROVENANCE.json')).hexdigest()
    mobile_count = len(json.loads(archive.read(prefix + 'wuying-sdk-go/mobile/api.json'))['methods'])
    selection = examples + ['docs/reference/js/index.d.ts']
    for name in selection:
        info = archive.getinfo(prefix + name)
        if info.file_size > 1_000_000 or ((info.external_attr >> 16) & 0o170000) == 0o120000:
            raise SystemExit('Unexpected archive member: ' + name)
        content = archive.read(info)
        source_hashes['archive:' + name] = hashlib.sha256(content).hexdigest()
        destination = 'downloads/' + (name + '.txt' if name.startswith('examples/') else 'reference/js/index.d.ts.txt')
        downloads[destination] = content
        route_by_path[(reference.parent / name).resolve()] = '/' + destination
        if name.startswith('docs/'):
            route_by_path[(reference / name.removeprefix('docs/')).resolve()] = '/' + destination
    # Customer-requested instruction bundles only: no CLI implementation or credentials.
    skill_files = {
        'wuying-remote-desktop': ['SKILL.md', 'references/installation.md', 'references/cloud-operations.md'],
        'wuying-cloud-resources': ['SKILL.md', 'references/installation.md', 'references/desktop-operations.md'],
    }
    bundle = BytesIO()
    with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as skill_zip:
        for skill, files in skill_files.items():
            for relative in files:
                name = 'wuying-sdk-cli/skills/' + skill + '/' + relative
                info = archive.getinfo(prefix + name)
                if info.file_size > 65_536 or ((info.external_attr >> 16) & 0o170000) == 0o120000:
                    raise ValueError('Unexpected Skill instruction member: ' + name)
                content = archive.read(info)
                content.decode('utf8')
                source_hashes['archive:' + name] = hashlib.sha256(content).hexdigest()
                downloads['downloads/skills/' + skill + '/' + relative + '.txt'] = content
                item = zipfile.ZipInfo('wuying-cli-skills/' + skill + '/' + relative, date_time=(2026, 11, 11, 0, 0, 0))
                skill_zip.writestr(item, content, compress_type=zipfile.ZIP_DEFLATED)
    downloads['downloads/skills/wuying-cli-skills.zip'] = bundle.getvalue()

def links(text, source):
    def replace(match):
        label, target = match.groups()
        target = target.strip()
        url = urlsplit(target)
        if url.scheme:
            if url.scheme not in {'http', 'https', 'mailto'}:
                raise ValueError('Unsupported documentation link scheme')
            return match.group(0)
        if target.startswith(('/', '#')):
            return match.group(0)
        resolved = (source.parent / unquote(url.path)).resolve()
        if resolved not in route_by_path:
            raise ValueError(f'Unmapped link in {source.name}: {target}')
        destination = route_by_path[resolved] + ('#' + url.fragment if url.fragment else '')
        return f'[{label}]({destination})'
    return re.sub(r'\[([^\]]+)\]\(([^)]+)\)', replace, text)

def mdx_safe(text):
    """Escape prose JSX without touching code fences or inline code."""
    result, fence, inline = [], None, None
    for line in text.splitlines(keepends=True):
        marker = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)', line)
        if marker and inline is None:
            current = marker.group(1)
            if fence is None:
                fence = current
            elif current[0] == fence[0] and len(current) >= len(fence) and not marker.group(2).strip():
                fence = None
            result.append(line)
            continue
        if fence:
            result.append(line)
            continue
        pieces = re.split(r'(`+)', line)
        for index, piece in enumerate(pieces):
            if piece and set(piece) == {'`'}:
                if inline is None:
                    inline = len(piece)
                elif inline == len(piece):
                    inline = None
            elif inline is None:
                pieces[index] = piece.replace('<', '&lt;').replace('>', '&gt;').replace('{', '\\{').replace('}', '\\}')
        result.append(''.join(pieces))
    return ''.join(result).rstrip() + '\n'

descriptions = {
    'integration/01-auth-and-lifecycle': '区分 aliuid 维度的管理员 AK/SK 权限与无影客户端用户态权限；用户态支持 AuthCode、LoginToken 和组织账号密码三种认证方式。',
    'getting-started/overview': '选择 Go、Java、JS 或 CLI，准备身份、运行环境与独占数据位置。',
    'getting-started/first-conversation': '选择授权 Runtime 与 Agent，创建会话、发送一次任务，并核对真实执行终态。',
    'guides/index': '按任务查找认证、会话、流式展示、附件、审批与恢复指南。',
    'guides/streaming': '按稳定身份更新快照，区分消息受理、执行结束和最终展示完整。',
    'guides/interactions': '展示真实审批与问题，只提交用户明确选择的响应。',
    'sdk-reference/index': '按语言进入安装、示例、精确 API 签名、DTO 与命令参考。',
    'support/troubleshooting': '从身份、运行环境、同步覆盖和稳定请求身份定位问题。',
    'reference/go/api': '同版本 Go 根入口、config、manager 与 model 公共包的完整签名。',
    'reference/java/api': '同版本 Java SDK jar 的公开签名；参数说明另见随包离线 Javadoc。',
    'reference/cli/commands': 'CLI 的命令、选项、结构化输出、退出码和恢复边界。',
}
stream_note = ('\n## 当前 JS 业务流的交付范围\n\n'
               '当前 JS `sendMessageStream()` 实现交付 `message` 与 `turn` 快照。'
               '`StreamChunk` 声明中的 `text.delta` / `text.replace` 不代表此版本会实际交付这两类事件；'
               '界面以真实消息快照更新，不能等待尚未交付的文本增量。各语言按其实际实现与同版本类型使用。\n')
rendered = {}
for filename, route in pages.items():
    source = reference / filename
    raw = source.read_text()
    source_hashes['docs:' + filename] = hashlib.sha256(raw.encode()).hexdigest()
    title_match = re.match(r'^#\s+(.+)\n', raw)
    if not title_match:
        raise ValueError('Missing page title: ' + filename)
    title = title_match.group(1).strip()
    body = raw[title_match.end():].lstrip()
    body = links(body, source)
    if filename in ['guides/streaming.md', 'integration/02-conversations-and-streams.md',
                    'domain-model/06-turn-items.md', 'domain-model/10-projection-events.md']:
        body += stream_note
    if filename == 'support/troubleshooting.md':
        body = body.replace('GitHub 仓库与私人安全报告渠道尚未指定时，按当前交付渠道联系维护方；不要把安全漏洞细节投到公开 Issue。GitHub 公开地址和安全渠道配置完成后，由维护方更新此入口。',
                            '一般接入问题可通过 [GitHub 项目入口](https://github.com/wuying-sdk/wuying-sdk) 联系维护方。私密安全报告渠道尚待确认，请沿当前交付渠道联系维护团队，不在公开 Issue 提交漏洞细节。')
    # Site-only adaptations stay reproducible; the customer delivery is read-only.
    # Insert JSX after escaping source prose so imports/components remain valid MDX.
    body = mdx_safe(body).replace('/domain-model/cloud)', '/domain-model/00-overview)').replace('[云能力的语言差异](/domain-model/00-overview)', '[能力地图](/domain-model/00-overview)')
    if filename == 'integration/01-auth-and-lifecycle.md':
        title = '授权与认证'
        body = body.replace('demo 的组织/用户名/密码登录属于 demo Host，不是需要客户照搬的 SDK 登录接口。', '组织账号密码登录已在当前 JS / Go / Java 根 Client 开放，初始化、挑战边界与 CLI stdin 用法见[SDK Client](/getting-started/initialize-client)；移动端配置未开放此方式。')
        body = body.replace('AuthCode 或登录三元组', 'AuthCode 或 LoginToken 登录态')
        body = body.replace('AuthCode 或 LoginToken 登录态 | 客户自己的认证后端', 'AuthCode、LoginToken 或组织账号密码 | 客户自己的认证后端/安全输入')
        body = body.replace('LoginToken 模式必须同时提供 sessionId、endUserId', 'LoginToken 方式使用 SDK 参数 loginToken，并必须同时提供 sessionId、endUserId')
        body = body.replace('公共 SDK 不把 AK/SK 或用户名密码视为所有语言统一支持的 Client 参数。客户服务端可按已授权云 API 换取 AuthCode；AK/SK 留在服务端。', '管理员权限使用 aliuid 维度的 AK/SK；当前 JS / Go / Java 根 Client 提供 AK/SK 模式，AK/SK 保留在受信任服务端。无影客户端用户态使用 AuthCode、LoginToken 或组织账号密码；具体初始化参数按本语言接口使用。')
        body = "import AuthenticationModel from '/snippets/authentication-model.mdx';\n\n<AuthenticationModel />\n\n" + body
    if filename == 'cli.md':
        body = body.replace('CLI 不接受用户名密码参数，也不会读取 AgentShell 的登录文件。', '组织账号密码通过 auth login --stdin 或宿主环境注入，不接受命令行密码参数，也不会读取 AgentShell 的登录文件；初始化示例见 [SDK Client](/getting-started/initialize-client)。')
        body = "import CliAdministration from '/snippets/cli-administration.mdx';\n\n" + body.replace('## 查询、建会与运行', '<CliAdministration />\n\n## 查询、建会与运行')
    if filename == 'guides/README.md':
        body = '通过 Agent 调用 CLI 时，先[安装配套 Skill](/guides/cli-skills)，再按任务选择云资源管理或远程 Agent 委派。\n\n' + body
    if filename == 'getting-started/overview.md':
        body = body.replace('有效 AuthCode，或完整 loginToken/sessionId/endUserId 登录材料', '有效 AuthCode、完整 loginToken/sessionId/endUserId 登录材料，或组织账号密码（JS / Go / Java / CLI）').replace('四种 SDK 的业务入口不等于桌面端用户名密码登录界面。', 'Android / iOS 当前移动配置只支持 AuthCode 或 LoginToken。')
        original = '无影 SDK 用于发现已授权的执行环境和 Agent，管理业务会话，发送任务，并消费消息、执行过程、附件与交互。'
        if body.count(original) != 1:
            raise ValueError('Getting-started introduction changed')
        body = body.replace(original,
            '无影 SDK 是无影对外集成能力的统一入口，面向资源管理、资源内操作系统操作与 Agent 集成等场景。'
            '整体能力范围见[SDK 简介](/index)。\n\n'
            '完成安装和身份准备后，按业务选择下面的四个快速示例；'
            '具体接口和语言支持见 [SDK Reference](/sdk-reference/index)。')
        body += '\n\n## 选择快速示例\n\n' + '\n'.join([
            '- [创建桌面并完成 Agent 对话](/getting-started/desktop-to-agent)：管理员创建桌面、取 AuthCode，再用用户态 Client 发送消息并读取答案。',
            '- [连接 ASP 画面](/getting-started/asp)：用 Node 或 CLI 打开交互桌面。',
            '- [远程脚本启动应用](/getting-started/remote-script)：在 Windows 桌面启动记事本并核对结果。',
            '- [连接桌面内服务](/getting-started/port-service)：启动 HTTP 服务，经端口服务完成一次消息交互。',
        ]) + '\n'
        title = '接入准备与安装'
        body = ('先确定[服务端或用户端认证路径](/integration/01-auth-and-lifecycle)，'
                '完成本页的安装与环境准备，再进入[初始化 Client](/getting-started/initialize-client)。\n\n' + body)
    if filename == 'getting-started/first-conversation.md':
        body = ('开始前先完成[授权与认证](/integration/01-auth-and-lifecycle)、'
                '[初始化 Client 与只读验证](/getting-started/initialize-client)。\n\n' + body)
    if filename == 'getting-started/first-conversation.md':
        marker = '## 3. 执行完整示例\n'
        if body.count(marker) != 1:
            raise ValueError('First-task insertion point changed')
        body = body.replace(marker, marker + '\n'
            '下面只展示创建会话和发送消息的核心语句。`client`、`ctx`、目标标识和消息请求标识已准备好；'
            'Go 片段放在返回 error 的函数内，Java 异步结果由调用方处理。'
            '完整程序见下方链接；全部参数见[创建会话](/api-reference/conversations/create)与'
            '[发送并等待](/api-reference/messages/wait)。建会的可选 mutationId 在最短示例中省略；'
            '生产重试仍需提前保存该标识并查询原回执。\n\n<FirstTask />\n\n')
        cli_flow = r'CLI 安装后可执行以下流程；[^\n]*\n\n```sh\n.*?\n```'
        body, replaced = re.subn(cli_flow, '取得本次真实 conversationId 与 turnId 后，可继续只读核对结果；移动端 onEvent/onPage 是宿主回调。\n\n<DemoTaskStatus />', body, count=1, flags=re.S)
        if replaced != 1:
            raise ValueError('First-conversation CLI flow changed')
        body = body.replace('四种语言已提供的操作', '各语言已提供的操作')
        body = "import DemoTaskStatus from '/snippets/demo-task-status.mdx';\nimport FirstTask from '/snippets/first-task.mdx';\n\n" + body
    if filename == 'guides/README.md':
        body = '[管理员 OAuth](/guides/administrator-oauth) · [浏览器 ASP 桌面](/guides/asp-desktop) · [DeepSeek Harness](/guides/deepseek-harness)\n\n' + body
        body = '[先看代码示例：查询环境、订阅消息与完整 Demo →](/examples/index)\n\n' + body
        body += '\n## 共用接入方法\n\n- [读取查询结果](/domain-model/10-projection-events)与[判断数据是否可用](/domain-model/projection)：取出数据并判断是否完整。\n- [实时订阅与停止监听](/domain-model/subscription)：随消息变化更新界面，退出时释放自己的订阅。\n- [超时后查询原结果](/domain-model/command-receipt)与[处理错误与恢复](/domain-model/12-errors-examples)：先核对原请求，避免重复提交。\n'
    if filename == 'sdk-reference/README.md':
        body = ('从左侧 SDK 下拉选择 **JavaScript / TypeScript、Go、Java、Android、iOS 或 CLI**，'
                '查看该语言的类/接口目录、完整公开清单与原始签名。'
                '按业务模型查操作进入 [API Reference](/api-reference/index)，'
                '全量范围与覆盖证据见[覆盖清单](/api-reference/coverage/index)。\n\n'
                '移动端入口见 [Android](/sdk-reference/android) 与 [iOS](/sdk-reference/ios)；'
                '使用各自原生包装与配套 Go 引擎制品，发布和验证范围见[移动合同](/reference/mobile/contract)。\n\n' + body)
    if route == 'domain-model/language-bindings':
        body += '\n\n## Android 与 iOS\n\n'\
            '- [Android 安装、初始化与完整方法](/sdk-reference/android)\n'\
            '- [iOS 安装、初始化与完整方法](/sdk-reference/ios)\n'\
            '- [移动端认证、数据与生命周期](/reference/mobile/contract)\n\n'\
            '两端使用原生包装与 Go 移动引擎，通过 Client.request 和 Methods 常量调用。'\
            f'当前同源清单各 {mobile_count} 个入口；与服务端 Java SDK 分别核对，不从语言名称推断能力等价。\n'
    if filename == 'guides/streaming.md':
        body = '[查看可接入界面的消息订阅代码 →](/examples/index#2-订阅会话消息)\n\n' + body
    # Split links that used to point at combined model chapters.
    for old, new in {
        '[Runtime/Agent](/domain-model/02-runtime-agent)': '[Runtime](/domain-model/02-runtime-agent) / [Agent](/domain-model/agent)',
        '[Message/Presentation](/domain-model/05-message)': '[Message](/domain-model/05-message) / [MessagePresentation](/domain-model/message-presentation)',
        '[Turn/Item](/domain-model/06-turn-items)': '[Turn](/domain-model/06-turn-items) / [Item](/domain-model/item)',
        '[Resource/Attachment](/domain-model/08-resource-attachment)': '[Attachment](/domain-model/attachment)',
        '[成员与配置应用](/domain-model/04-member-config) | Member/Config': '[Member](/domain-model/04-member-config) / [Config](/domain-model/config) | Member / Config',
        '[文件对象和能力边界](/domain-model/09-workspace-files) | Workspace/文件': '[Workspace](/domain-model/09-workspace-files) / [WyDrive](/domain-model/wy-drive) / [MessageCloudFile](/domain-model/message-cloud-file) | Workspace / WyDrive / MessageCloudFile'
    }.items():
        body = body.replace(old, new)
    body = body.replace('/domain-model/02-runtime-agent#runtime-命令执行与结果事件', '/domain-model/remote-script').replace('/domain-model/02-runtime-agent#执行系统命令', '/domain-model/remote-script')
    if filename.startswith('reference/'):
        body = '<Note>本页按所选语言保留原始完整参考，可能包含该语言的业务示例。跨语言操作请使用[快速开始](/getting-started/desktop-to-agent)和[代码示例](/examples/index)中的语言卡片。</Note>\n\n' + body
    description = descriptions.get(route, title + '：职责、模型关联、生命周期、公开操作与使用边界。')
    frontmatter = f'---\ntitle: {json.dumps(title, ensure_ascii=False)}\ndescription: {json.dumps(description, ensure_ascii=False)}\n---\n\n'
    if filename == 'integration/01-auth-and-lifecycle.md':
        frontmatter = frontmatter.replace('---\n\n', 'sidebarTitle: "授权与认证"\nicon: "key"\n---\n\n')
    body = body.replace('](/downloads/', ']('+'https://github.com/wuying-sdk/wuying-sdk/raw/refs/heads/main/docs/downloads/')
    body = body.replace('/domain-model/01-client', '/getting-started/initialize-client')
    rendered[route + '.mdx'] = (frontmatter + body).encode()

# Curated, independently authored model pages override the combined customer chapters.
# content/domain-model is the authoring owner; docs/domain-model is its projection.
model_source = project / 'content/domain-model'
for navigation_file in ['navigation.json', 'guide-navigation.json']:
    if (model_source / navigation_file).is_symlink():
        raise ValueError('Symlink navigation input rejected')
model_navigation = json.loads((model_source / 'navigation.json').read_text())
guide_navigation = json.loads((model_source / 'guide-navigation.json').read_text())
guide_groups = guide_navigation['groups']
if not guide_groups or any(set(g) != {'group', 'pages'} or not isinstance(g['group'], str) or not g['group'] or not isinstance(g['pages'], list) for g in guide_groups):
    raise ValueError('Invalid integration guide navigation')
guide_names = [g['group'] for g in guide_groups]
if len(set(guide_names)) != len(guide_names):
    raise ValueError('Duplicate integration guide groups')
model_outputs = {}
for page in sorted(model_source.glob('*.mdx')):
    if page.is_symlink() or not re.fullmatch(r'[a-z0-9-]+\.mdx', page.name):
        raise ValueError('Unsafe domain authoring input')
    content = page.read_bytes()
    model_outputs['domain-model/' + page.name] = content
    source_hashes['site:content/domain-model/' + page.name] = hashlib.sha256(content).hexdigest()
def model_routes(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for child in node.get('pages', []):
            yield from model_routes(child)
routes = list(model_routes(model_navigation)) + [route for group in guide_groups for route in model_routes(group)]
if len(routes) != len(set(routes)) or {name + '.mdx' for name in routes} != set(model_outputs):
    raise ValueError('Domain navigation must represent each authored page exactly once')
for navigation_file in ['navigation.json', 'guide-navigation.json']:
    source_hashes['site:content/domain-model/' + navigation_file] = hashlib.sha256((model_source / navigation_file).read_bytes()).hexdigest()
rendered.update(model_outputs)
config_path = docs / 'docs.json'
if config_path.is_symlink():
    raise ValueError('Unsafe configuration output')
config = json.loads(config_path.read_text())
docs_tab = next(tab for tab in config['navigation']['tabs'] if tab['tab'] == 'Docs')
matching_groups = [i for i, group in enumerate(docs_tab['groups']) if group['group'] == '领域模型']
if len(matching_groups) != 1:
    raise ValueError('Expected one domain model navigation group')
docs_tab['groups'][matching_groups[0]] = model_navigation
# The same authoring owner projects shared result/recovery pages into Guides.
prior_metadata = json.loads((project / 'reference-content-manifest.json').read_text()) if (project / 'reference-content-manifest.json').exists() else {}
prior_guide_names = prior_metadata.get('guide_navigation_groups', [])
guides_tab = next(tab for tab in config['navigation']['tabs'] if tab['tab'] == 'Guides')
for group in guides_tab['groups']:
    if group['group'] in guide_names and group['group'] not in prior_guide_names:
        raise ValueError('Refusing unowned integration guide navigation group: ' + group['group'])
retained = [group for group in guides_tab['groups'] if group['group'] not in set(prior_guide_names + guide_names)]
guides_tab['groups'] = retained[:1] + guide_groups + retained[1:]

outputs = {**downloads, **rendered}
previous_manifest = project / 'reference-content-manifest.json'
if previous_manifest.exists():
    old_outputs = json.loads(previous_manifest.read_text()).get('generated_sha256', {})
    # Reject edits to rendered model pages before writing any output; edit their authoring sources instead.
    for relative in model_outputs:
        destination = docs / relative
        if destination.is_symlink() or not destination.resolve().is_relative_to(docs.resolve()):
            raise ValueError('Unsafe domain output destination')
        if destination.exists():
            if relative not in old_outputs:
                raise ValueError('Refusing unowned domain output: ' + relative)
            if hashlib.sha256(destination.read_bytes()).hexdigest() != old_outputs[relative]:
                raise ValueError('Rendered domain page was edited; edit content/domain-model instead: ' + relative)
    for relative in set(old_outputs) - set(outputs):
        stale = docs / relative
        if stale.is_symlink() or not stale.resolve().is_relative_to(docs.resolve()):
            raise ValueError('Unsafe stale output path')
        if stale.exists():
            if hashlib.sha256(stale.read_bytes()).hexdigest() != old_outputs[relative]:
                raise ValueError('Refusing to delete a modified generated file: ' + relative)
            stale.unlink()
for relative, content in outputs.items():
    destination = docs / relative
    if destination.is_symlink() or not destination.resolve().is_relative_to(docs.resolve()):
        raise ValueError('Unsafe output destination')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

manifest = {
    'guide_navigation_groups': guide_names,
    'sdk_source_commit': sdk_commit,
    'sdk_source_state': source_state,
    'documentation_origin': 'Selected customer-facing delivery documentation, with canonical domain model pages authored in content/domain-model and projected into docs; all inputs versioned by file hash independently of SDK commit.',
    'source_archive_sha256': hashlib.sha256(args.draft_archive.read_bytes()).hexdigest(),
    'input_sha256': source_hashes,
    'generated_sha256': {name: hashlib.sha256(content).hexdigest() for name, content in outputs.items()},
    'publication': 'Local preview only; no release approval is inferred.',
}
config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
(project / 'reference-content-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(f'Imported {len(rendered)} documentation pages and {len(downloads)} reference/example/Skill artifacts; no SDK source tree or demo imported.')
