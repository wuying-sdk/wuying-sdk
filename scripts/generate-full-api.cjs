#!/usr/bin/env node
// A complete declaration ledger and model-operation reference. Does not execute SDK calls.
const fs = require('node:fs'), path = require('node:path');
const api = require('./lib/public-api.cjs');
const project = path.resolve(__dirname, '..'), docs = path.join(project, 'docs');
for (const name of ['api-operation-manifest.json', 'api-coverage.json']) {
    if (fs.lstatSync(project).isSymbolicLink() || fs.lstatSync(path.join(project, name), { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw Error('Symlink root output rejected: ' + name);
    }
}
const check = process.argv.includes('--check');
const ref = JSON.parse(fs.readFileSync(path.join(project, 'reference-content-manifest.json'), 'utf8'));
const mobileReference = require('./lib/mobile-reference.cjs');
const mobile = mobileReference.load(project, ref.sdk_source_commit, ref.source_archive_sha256);
const sources = { js: api.readJS(project), go: api.readGo(project), java: api.readJava(project), cli: api.readCLI(project) };
// Authored domain pages have one owner; refuse stale source/projection pairs.
const modelSource = path.join(project, 'content/domain-model');
const modelInputNames = Object.keys(ref.input_sha256).filter(n => n.startsWith('site:content/domain-model/')).sort();
const modelSourceNames = fs.readdirSync(modelSource).map(n => 'site:content/domain-model/' + n).sort();
if (JSON.stringify(modelInputNames) !== JSON.stringify(modelSourceNames))
    throw Error('Domain model inputs changed; run import-reference.py first');
for (const name of modelInputNames) {
    if (!/^site:content\/domain-model\/[a-z0-9-]+\.(mdx|json)$/.test(name)) throw Error('Unsafe domain model input');
    const relative = name.slice('site:'.length);
    const bytes = fs.readFileSync(path.join(project, relative));
    if (api.hash(bytes) !== ref.input_sha256[name]) throw Error('Stale domain model source: ' + relative);
    if (name.endsWith('.mdx')) {
        const output = 'domain-model/' + path.basename(relative);
        if (api.hash(bytes) !== ref.generated_sha256[output] || !fs.readFileSync(path.join(docs, output)).equals(bytes))
            throw Error('Stale domain model projection: ' + output);
    }
}
const modelNavigation = JSON.parse(fs.readFileSync(path.join(modelSource, 'navigation.json'), 'utf8'));
const guideNavigation = JSON.parse(fs.readFileSync(path.join(modelSource, 'guide-navigation.json'), 'utf8'));

for (const relative of ['reference/java/api.mdx', 'reference/go/api.mdx'])
    if (api.hash(fs.readFileSync(path.join(docs, relative))) !== ref.generated_sha256[relative])
        throw Error('Reference declaration input mismatch: ' + relative);
const goIds = sources.go.entries.map(e => e.id.slice(3)).sort();
if (JSON.stringify(goIds) !== JSON.stringify([...sources.go.snapshot.compiler_verified_ids].sort()))
    throw Error('Go compiler method-set snapshot differs');
if (sources.js.source_sha256 !== ref.generated_sha256['downloads/reference/js/index.d.ts.txt'])
    throw Error('JS declaration snapshot mismatch');
for (const snapshot of [sources.go.snapshot, sources.cli.snapshot, JSON.parse(fs.readFileSync(path.join(project, 'scripts/public-api-inputs/java-source.json'), 'utf8'))]) {
    if (snapshot.sdk_source_commit !== ref.sdk_source_commit || snapshot.source_archive_sha256 !== ref.source_archive_sha256)
        throw Error('Mixed SDK snapshot inputs');
}
const outputs = new Map();
const fmt = (title, description, sidebar = title) => `---\ntitle: ${JSON.stringify(title)}\nsidebarTitle: ${JSON.stringify(sidebar)}\ndescription: ${JSON.stringify(description)}\n---\n\n`;
const safe = s => s.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('{', '\\{').replaceAll('}', '\\}');
const fence = (lang, text) => '```' + lang + '\n' + text + '\n```\n';
const langNames = { js: 'JavaScript / TypeScript', go: 'Go', java: 'Java', cli: 'CLI' };
const codeLang = { js: 'ts', go: 'go', java: 'java', cli: 'sh' };
const entries = Object.values(sources).flatMap(s => s.entries);
const internalFacades = new Set(['publishGroupMessage','exportGroupHistory','listAuthorizedUsers','listAuthorizedGroups','getAuthorizedGroup','subscribeGroup','unsubscribeGroup']);
const leakedInternal = entries.filter(e => ['getmutation','subscribemutation','getagentinstancemodelconfig','buildmodelmanager'].includes(e.name.toLowerCase()) || ['ModelManager','ResourceManager'].includes(e.owner.split('.').at(-1)) || e.name.toLowerCase() === 'setchannelgroupmodel' || ['CloudClient','AdminImClient'].includes(e.owner.split('.').at(-1)) || ['getIMCredentials','refreshLogin','buildResourceManager','BuildResourceManager'].includes(e.name) || e.owner.endsWith('.ConversationManager') && internalFacades.has(e.name));
if (leakedInternal.length) throw Error('Internal implementation leaked into customer declarations: ' + leakedInternal.map(e => e.id).join(', '));

for (const language of Object.keys(sources)) {
    const ids = sources[language].entries.map(e => e.id);
    if (new Set(ids).size !== ids.length)
        throw Error('Duplicate binding identity in ' + language);
}
function owner(e) {
    if (e.language === 'js')
        return e.owner;
    if (e.language === 'java')
        return e.owner.split('.').at(-1) === 'WuyingClient' ? 'Client' : e.owner.split('.').at(-1);
    if (e.language === 'go') {
        if (e.owner.includes('/transport/agmessage.'))
            return 'GoTransport' + e.source_owner;
        if (e.owner.includes('/mobile'))
            return 'GoMobile' + (e.source_owner === 'mobile' ? '' : e.source_owner);
        return e.source_owner === 'wuying-sdk-go' ? 'Functions' : e.source_owner;
    }
    return 'CLI';
}
const cliMap = { 'desktops create': ['Client', 'create'], 'desktops wait': ['Client', 'wait'], 'desktops start': ['Client', 'start'], 'desktops stop': ['Client', 'stop'], 'desktops reboot': ['Client', 'reboot'], 'desktops reset': ['Client', 'reset'], 'desktops delete': ['Client', 'delete'], 'auth code': ['Client', 'getAuthCode'], 'runtimes run-command': ['RuntimeManager', 'runCommand'], 'runtimes subscribe-command': ['RuntimeManager', 'subscribeCommand'], 'runtimes list': ['RuntimeManager', 'listRuntimes'], 'agents list': ['AgentManager', 'listAgents'], 'models list': ['AgentManager', 'listAgentModels'], 'conversations create': ['ConversationManager', 'createConversation'], 'conversations list': ['ConversationManager', 'listConversations'], 'conversations get': ['ConversationManager', 'getConversation'], 'messages list': ['ConversationManager', 'listMessages'], 'messages get': ['ConversationManager', 'getMessagePresentation'], 'turns status': ['ConversationManager', 'getTurn'], 'turns cancel': ['ConversationManager', 'cancelTurn'], 'interactions list': ['ConversationManager', 'listInteractions'], 'interactions refresh': ['ConversationManager', 'refreshPendingInteractions'] };
function identity(e) {
    if (e.language === 'cli' && e.name === 'desktops create') return 'client.provision';
    if (e.language === 'cli' && cliMap[e.name])
        return cliMap[e.name].map(api.normal).join('.');
    const own = owner(e);
    if (e.name === 'getAuthCode' && ['Functions', 'AuthApi', 'CloudClient'].includes(own))
        return 'auth.getauthcode';
    if (own === 'Client' && e.name.toLowerCase() === 'create' && !e.static && e.name !== 'constructor') return 'client.provision';
    if ((own === 'Client' && (e.name === 'constructor' || e.static && e.name === 'create')) || (own === 'Functions' && e.name === 'NewClient'))
        return 'client.create';
    return api.normal(own) + '.' + api.normal(e.name);
}
const editorial = new Map();
const operationDescriptions = JSON.parse(fs.readFileSync(path.join(project, 'scripts/api-descriptions.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(project, 'scripts/api-models.json'), 'utf8'));
for (const group of catalog.groups)
    for (const op of group.operations)
        editorial.set(api.normal(group.factory.replace(/^build/, '')) + '.' + api.normal(op.method), { ...op, group: group.key, groupTitle: group.title, route: 'api-reference/' + group.key + '/' + op.slug });
const models = { client: ['Client', 'getting-started/initialize-client'], auth: ['Auth', 'getting-started/initialize-client'], runtimes: ['Runtime', 'domain-model/02-runtime-agent'], agents: ['Agent', 'domain-model/agent'], conversations: ['Conversation', 'domain-model/03-conversation'], members: ['Member', 'domain-model/04-member-config'], configuration: ['Config', 'domain-model/config'], messages: ['Message', 'domain-model/05-message'], turns: ['Turn', 'domain-model/06-turn-items'], executions: ['Execution', 'domain-model/execution'], interactions: ['Interaction', 'domain-model/07-interaction'], receipts: ['CommandReceipt', 'domain-model/command-receipt'], drafts: ['Draft', 'domain-model/draft'], attachments: ['Attachment', 'domain-model/attachment'], workspaces: ['Workspace', 'domain-model/09-workspace-files'], files: ['File', 'domain-model/message-cloud-file'], knowledge: ['Knowledge', 'domain-model/knowledge-space'], skills: ['Skill', 'domain-model/11-cloud-capabilities'], models: ['Model', 'domain-model/model'], credits: ['Credit', 'domain-model/credit'], asp: ['ASP', 'domain-model/asp'], sync: ['Group', 'domain-model/group-sync-state'], streams: ['MessageStream', 'domain-model/stream-chunk'], subscriptions: ['Subscription', 'domain-model/subscription'], 'cloud-api': ['CloudClient', 'getting-started/initialize-client'], admin: ['Admin', 'getting-started/initialize-client'], transport: ['Transport', 'domain-model/10-projection-events'], mobile: ['Mobile', 'domain-model/language-bindings'], cli: ['CLI', 'domain-model/language-bindings'] };
function groupFor(e) {
    const own = owner(e), n = e.name.toLowerCase();
    if (e.language === 'cli' && e.name === 'asp open') return 'asp';
    if (e.language === 'cli' && !cliMap[e.name])
        return 'cli';
    if (own.startsWith('GoMobile'))
        return 'mobile';
    if (own.startsWith('GoTransport') || e.owner.includes('.transport.'))
        return 'transport';
    if (e.owner.includes('.admin.'))
        return 'admin';
    if (own === 'Client')
        return 'client';
    if (identity(e) === 'auth.getauthcode')
        return 'auth';
    if (own === 'CloudClient')
        return 'cloud-api';
    if (own === 'Subscription')
        return 'subscriptions';
    if (own === 'MessageStream')
        return 'streams';
    if (own === 'AgentManager') {
        if (/wydrive|downloadurl/.test(n))
            return 'files';
        if (/knowledge/.test(n))
            return 'knowledge';
        return /runtime|hostcapabilit/.test(n) ? 'runtimes' : 'agents';
    }
    if (own === 'ConversationManager') {
        if (/mutation|receipt/.test(n))
            return 'receipts';
        if (/groupsync|listgroups|syncgroup|syncconversation/.test(n))
            return 'sync';
        if (/member/.test(n))
            return 'members';
        if (/config|composer/.test(n))
            return 'configuration';
        if (/interaction|permission|question/.test(n))
            return 'interactions';
        if (/liveprocess|execution/.test(n))
            return 'executions';
        if (/turn/.test(n))
            return 'turns';
        if (/attachment/.test(n))
            return 'attachments';
        if (/storagecontext/.test(n))
            return 'workspaces';
        if (/message|history|readbinding|resolveconversationread/.test(n))
            return 'messages';
        return 'conversations';
    }
    if (own === 'AttachmentManager' || own === 'WorkspaceManager')
        return /draft/.test(n) ? 'drafts' : /workspace/.test(n) ? 'workspaces' : /attachment|imgroupfile|attachcloudfile/.test(n) ? 'attachments' : 'resources';
    if (own === 'AspManager')
        return 'asp';
    if (own === 'SkillManager')
        return 'skills';
    if (own === 'ModelManager')
        return 'models';
    if (own === 'CreditManager')
        return 'credits';
    if (own === 'RuntimeManager')
        return 'runtimes';
    return 'client';
}
function operational(e) {
    const own = owner(e);
    if (own === 'Client' && (/^(build|resetInstance|getAuthCodeCredential)/.test(e.name) || (e.name === 'constructor' || e.static && e.name === 'create')))
        return false;
    if (e.name === 'constructor' || e.static && e.name.startsWith('build'))
        return false;
    return e.role === 'operation';
}
const operations = new Map();
for (const e of entries)
    if (operational(e)) {
        const id = identity(e);
        if (!operations.has(id))
            operations.set(id, { id, bindings: [], representative: e });
    }
for (const e of entries) {
    const op = operations.get(identity(e));
    if (op)
        op.bindings.push(e);
}
const manual = { 'client.create': 'api-reference/client/create', 'client.close': 'api-reference/client/close' };
const usedRoutes = new Set(Object.values(manual));
for (const op of operations.values()) {
    const override = editorial.get(op.id);
    const e = op.representative;
    op.group = override?.group || groupFor(e);
    const methodModelPages = {
        generatesceneurl: 'domain-model/port-service',
        describecreditpackageagents: 'domain-model/credit', describecreditusageinfo: 'domain-model/credit',
        questionresponsereceipt: 'domain-model/07-interaction',
        getquestionresponsereceipt: 'domain-model/07-interaction',
        getcommandreceipt: 'domain-model/command-receipt', subscribecommandreceipt: 'domain-model/command-receipt',
        describewydrives: 'domain-model/wy-drive',
        describewydrivefiles: 'domain-model/wy-drive-file', deletewydrivefile: 'domain-model/wy-drive-file',
        getdownloadurl: 'domain-model/wy-drive-file',
        listknowledgefiles: 'domain-model/knowledge-file', downloadknowledgefiles: 'domain-model/knowledge-file'
    };
    op.modelPage = methodModelPages[e.name.toLowerCase()] || models[op.group][1];
    if (['runtimemanager.runcommand','runtimemanager.subscribecommand'].includes(op.id)) op.modelPage = 'domain-model/remote-script';
    if (op.id === 'client.getauthcode' || op.id === 'client.provision' || op.id === 'client.wait' || owner(e) === 'Client' && ['start','stop','reboot','reset','delete'].includes(e.name.toLowerCase())) op.modelPage = 'domain-model/02-runtime-agent';
    op.title = (op.bindings.find(binding => binding.language === 'js') || e).name;
    op.description = operationDescriptions[op.id];
    if (typeof op.description !== 'string' || op.description.trim().length < 12 || !/[\u4e00-\u9fff]/.test(op.description))
        throw Error('Missing customer-facing purpose description: ' + op.id);
    op.notes = override?.notes || e.description || '公开方法的参数和返回值如下。使用前核对当前语言、认证模式、目标环境与能力。';
    if (!override) {
        const method = api.normal(e.name);
        const own = owner(e);
        if (op.id === 'attachmentmanager.attachcloudfile') op.notes = '导入当前会话关联云盘中已完成的普通文件（1..10MiB），返回 Attachment，可将 attachmentId 用于同会话发送消息。第一次调用前保存 UUID clientCommandId、runtimeId、conversationId 和完整 file 引用；结果未知时以同一请求再次调用，Gateway 复用原持久回执和附件。SDK 不自动循环重试，不重新上传文件或发送消息。更换文件或存储环境须作为新的明确操作；不要在结果未知时更换请求标识。file 仅包含 regionId、driveId、fileId 和可选 storageEnvironment（online/pre）；不接受 URL、任意云盘/知识库文件或客户端文件属性。导入的 clientCommandId 不用于 getCommandReceipt，导入恢复继续调用 attachCloudFile；消息发送未知时使用发送请求的独立标识查询消息回执。原有 Gateway 认证、文件校验与幂等 owner 不变。';
        if (own === 'RuntimeManager' && ['runcommand','subscribecommand'].includes(method)) op.notes = '仅 AK/SK 管理员支持；用户态返回 UNSUPPORTED。runCommand 提交一次，subscribeCommand 使用原 invokeId 只读恢复。accepted 保存回执；desktop 是替换快照；completed 检查 allSucceeded。退订/关闭只停止本地订阅，不撤销远端执行。完整事件、预算和恢复见 Runtime 领域说明。';
        if (e.language === 'cli' && e.name === 'asp open') op.notes = '用户态在浏览器打开指定 ASP 桌面，默认1小时；60秒内领取一次性交接，保持 CLI 运行。管理员凭据不支持；无需 Agent/IM 预检。断开只释放本地画面，不关机或取消任务。私有 GUI 管道及嵌入前提见 [ASP 操作指南](/guides/asp-desktop)。';
        if (e.language === 'cli' && e.name === 'auth oauth') op.notes = '使用明确的官方阿里云 OAuth profile 取得管理员签名凭据；--reuse 复用已有配置，--no-input 必须搭配 --reuse。无影只保存引用，官方 provider 拥有令牌和续期。它不产生无影用户 LoginToken，成功解析凭据也不证明资源权限。详见[管理员 OAuth 指南](/guides/administrator-oauth)。';
        if (e.language === 'cli' && e.name === 'auth login') op.notes = '通过 stdin 的 organizationId、username、password 登录无影用户态。成功后仅保存 LoginToken/sessionId/endUserId；不保存密码，失败保留原凭据；LOGIN_CHALLENGE_REQUIRED 退出 4，当前不承接后续挑战。';
        if (op.id === 'client.provision') op.notes = 'AK/SK 管理员态创建云桌面；服务端按真实权限处理。保留创建返回的订单/桌面身份后再 wait，未知结果时不能通过重复 create 恢复。此实例方法不同于初始化 Client 的静态工厂。';
        if (own === 'Client' && method === 'getauthcode') op.notes = 'Runtime 领域的管理员取票能力，当前调用入口为根 Client.getAuthCode。AK/SK 管理员态为已经核验映射的用户申请 AuthCode；不能在用户态 Client 调用，不能将取票接口开放为任意用户代签。凭据仅交给目标用户，不记录票据正文。';
        if (own === 'Client' && method === 'wait') op.notes = 'AK/SK 管理员态等待指定桌面创建完成；使用原创建结果的 regionId 与 desktopIds，创建成功不等于 Agent 或 IM 在线。';
        const desktopNotes = {
            start: '开机。用户态与 AK/SK 管理员态均支持；使用真实 regionId、desktopIds。',
            stop: '关机。两种身份均支持；stoppedMode 仅管理员态可用，osUpdate 可显式传 false。',
            reboot: '重启。两种身份均支持；osUpdate 仅用于关机/重启，不适用字段会被拒绝。',
            reset: '重置系统，实际调用 RebuildDesktops。用户态必须传 imageId；管理员态可省略并保留服务端默认行为。会初始化系统盘；检查返回 results 中每个桌面的 accepted 与 code。',
            delete: '释放云桌面。仅 AK/SK 管理员态支持，用户态调用返回 UNSUPPORTED。'
        };
        if (own === 'Client' && desktopNotes[method]) { op.desktopOperation = method; op.notes = desktopNotes[method] + ' 当前公开在根 Client，不是 RuntimeManager 方法；JS/TypeScript、Go、服务端 Java 和 CLI 有入口；Android/iOS 移动清单没有对应入口。返回值是受理信息，不是完成状态；写请求不自动重试。共享 DTO 不表示所有字段都适用于本操作。' + (method === 'delete' ? '本接口不接受 clientToken。' : 'clientToken 仅用于支持的用户态操作，管理员态不接受。'); }
        if (own === 'Client' && method === 'logout')
            op.notes = '释放当前本地身份与连接；不会调用云端注销接口，也不等于取消远端任务。';
        if (own === 'Client' && method === 'updatelogincredentials')
            op.notes = '当前 JS 仅允许更新通过登录态初始化、且 endUserId 和登录地域不变的 Client；不能用它切换账号或更新 AuthCode 路径。其他语言按各自接口核对。';
        if (own === 'Client' && method === 'subscribestreamevents')
            op.notes = '只读订阅已启用的原始流事件；不赋予执行控制权，不替代消息与 Turn 的业务快照。';
        if (op.group === 'auth')
            op.notes = '在受信任后端申请用户票据；先验证真实用户映射和授权。签发新 AuthCode 可能使同一用户旧票失效，不自动反复申请或记录票据正文。';
        if (own === 'AspManager' && method === 'stopaspstream')
            op.notes = '停止当前 ASP 流化会话；不等于取消 Agent Turn。';
        if (own === 'AspManager' && method === 'getaspstreamsession')
            op.notes = '读取当前流化会话；没有会话时返回 null。';
        if (own === 'MessageStream' && method === 'cancel')
            op.notes = '该操作会请求远端取消，不能当作只停止本地迭代；继续核对真实 Turn 终态。';
        if (own === 'MessageStream' && method === 'close')
            op.notes = '本地释放流的消费资源，不代表远端任务已取消；按对应语言合同处理。';
        if (e.language === 'cli' && e.name === 'auth import')
            op.notes = '通过 stdin 导入凭据。当前只支持 POSIX 私有 0600 明文文件，Windows 不支持持久导入；这不是钥匙串，也不验证在线身份。';
        if (e.language === 'cli' && e.name === 'auth logout')
            op.notes = '只移除本地持久凭据，不撤销远端 token，也不清除父进程环境。';
        if (e.language === 'cli' && e.name === 'auth status')
            op.notes = '只检查本地凭据配置，不证明在线身份或资源授权已通过。';
    }
    op.deprecated = op.bindings.some(e => e.deprecated);
    if (owner(e) === 'ResourceManager' && ['listresources', 'subscriberesources', 'getconversationresources', 'subscribeconversationresources', 'setconversationresources'].includes(api.normal(e.name))) throw Error('Removed reserved resource design entered customer API: '+e.name);
    op.unsupported = false;
    let candidate = (op.id === 'client.provision' ? 'api-reference/client/create-desktops' : undefined) || manual[op.id] || override?.route || 'api-reference/' + op.group + '/' + api.slug(e.name);
    if (usedRoutes.has(candidate) && manual[op.id] !== candidate)
        candidate = 'api-reference/' + op.group + '/' + api.slug(owner(e)) + '-' + api.slug(e.name);
    if (usedRoutes.has(candidate) && manual[op.id] !== candidate)
        throw Error('Operation route collision: ' + candidate);
    usedRoutes.add(candidate);
    op.route = candidate;
}
for (const id of Object.keys(operationDescriptions)) {
    if (!operations.has(id)) throw Error('Description without a public operation: ' + id);
}
function ledgerRoute(language) { return 'reference/' + language + '/public'; }
function anchor(entry) { return 'entry-' + api.hash(entry.id).slice(0, 16); }
const representation = new Map();
for (const e of entries)
    representation.set(e.id, manual[identity(e)] || operations.get(identity(e))?.route || ledgerRoute(e.language) + '#' + anchor(e));
const preferredJS = op => op.bindings.filter(e => e.language === 'js').sort((a, b) => (a.provider.kind === 'factory' ? -1 : 0) - (b.provider.kind === 'factory' ? -1 : 0))[0];
function schemas(entry) {
    if (!entry)
        return '';
    const surface = sources.js.surfaces.find(s => s.methods.some(m => m.item.id === entry.id));
    const method = surface?.methods.find(m => m.item.id === entry.id);
    if (!method)
        return '';
    const declarations = new Map(sources.js.source.statements.filter(n => n.name).map(n => [n.name.text, n]));
    const selected = new Map();
    const ts = require('typescript');
    const add = name => {
        if (['Promise', 'Array', 'ReadonlyArray'].includes(name) || selected.has(name))
            return;
        const node = declarations.get(name);
        if (!node || (!ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node) && !ts.isEnumDeclaration(node)))
            return;
        selected.set(name, node);
        if (name === 'CreateRequest')
            add('CreateBase');
        if (node.heritageClauses)
            for (const clause of node.heritageClauses)
                for (const type of clause.types)
                    add(type.expression.getText(sources.js.source));
    };
    const visit = node => {
        if (!node)
            return;
        if (ts.isTypeReferenceNode(node))
            add(node.typeName.getText(sources.js.source));
        ts.forEachChild(node, visit);
    };
    for (const sig of method.signatures) {
        const decl = sig.getDeclaration();
        if (decl) {
            for (const param of decl.parameters || [])
                visit(param.type);
            visit(decl.type);
        }
    }
    if (!selected.size)
        return '';
    return '## TypeScript 参数与结果结构\n\n以下结构直接摘自同版本声明；继承的身份字段一并列出。嵌套类型与完整数据字段见[类型声明](/reference/js/types)，Go / Java 以各自真实 DTO 为准。\n\n' + fence('ts', [...selected.values()].map(n => n.getText(sources.js.source)).join('\n\n')) + '\n';
}
for (const op of operations.values()) {
    if (manual[op.id])
        continue;
    let body = fmt(op.title, op.description);
    body += '`' + op.title + '` · ' + models[op.group][0] + '\n\n## 接口用途\n\n' + safe(op.description) + '\n\n## 使用说明\n\n' + safe(op.notes) + '\n\n';
    if (['runtimemanager.runcommand','runtimemanager.subscribecommand'].includes(op.id)) {
        const run = op.id.endsWith('.runcommand');
        body += '## 请求与结果\n\n| 字段 | 要求 |\n|---|---|\n| regionId / desktopIds | 必填；1–50 个不重复的真实桌面 ID，不能拿 runtimeId 代替 |\n';
        if (run) body += '| type / commandContent | 必填；脚本类型按云端支持原样传入，SDK 不猜测平台；UTF-8 脚本经 Base64 编码最多 16 KiB |\n| contentEncoding | PlainText / Base64；省略保留云端明文默认值；显式 Base64 必须为合法标准编码 |\n| timeoutSeconds | 可选，云端执行秒数；Go 零值、JS undefined、Java null 为省略 |\n| endUserId / commandRole | 可选，按明确输入透传；不推断执行用户或提升权限 |\n';
        else body += '| invokeId | 必填，原受理回执中的 ID；恢复不伪造原 requestId，也不再次提交执行 |\n';
        body += '| pollIntervalMs | 可选；10–60000ms，默认 2000ms；短间隔仅适合测试 |\n\n事件 accepted 保存 receipt；desktop 使用 result 替换输出并检查 outputTruncated / dropped；completed 检查 results / allSucceeded。只有 Success 且 exitCode 为字符串 "0" 才成功；缺失退出码不补零。脚本输出最多保留 16 KiB、错误信息最多 8 KiB，超限显式标记。\n\n每个 Client 最多 32 个活跃订阅。Node / Go 缺省订阅 10 分钟；Java CallContext.defaults 仅 30 秒。订阅最多 1 小时，并受调用期限与 HTTP timeout 约束。Go/Java 精确字段名见下方签名与原始 DTO。当前 Android/iOS 移动清单无此入口。\n\n提交不自动重试。已受理后的查询超时、拒绝或断线通过 onError 返回，结果仍未知；按 receipt 在新 Client 用 subscribeCommand 恢复。退订/关闭只停止本地订阅，不撤销远端执行。详见[远程脚本](/domain-model/remote-script)。\n\n';
    }
    if (op.id === 'client.provision') {
        body += '## 默认创建\n\n不指定资源参数时，默认上海（cn-shanghai）、服务端默认办公网络、1台4核8GiB Windows Server 2025的可用系统模板。Node 可直接调用 `await admin.create()`；Go 使用 `admin.Create(ctx, nil)`，Java 使用 `admin.create(ctx)`，CLI 使用 `wuying desktops create --profile admin`。\n\nSDK 使用签名 DescribeBundles 遍历目录并核对系统、CPU、MiB 内存、镜像和库存状态；优先简体中文，多个匹配项按 BundleId 稳定选择，磁盘沿用系统模板。无匹配项返回 UNSUPPORTED，目录异常或游标重复返回 PROTOCOL_ERROR；最多100页、每页100项。此路径还需要 DescribeBundles 读取权限。\n\n默认模板路径使用系统策略 system-all-enabled-policy，数量为1；未指定计费字段保留服务端默认值。显式 bundleId 不查询默认模板目录；其他显式参数仍可覆盖。省略等待选项仍只返回受理结果，需就绪时传 wait=true；默认网络由服务端按当前账号解析，SDK 不保存账号专属网络 ID。未指定 endUserIds 不自动分配普通用户。完整流程见[创建桌面并对话](/getting-started/desktop-to-agent)。\n\n';
    }
    if (op.desktopOperation) {
        const name = op.desktopOperation;
        const limit = name === 'reset' ? '两种身份均为 1–20 台' : name === 'delete' ? '管理员 1–100 台；不支持用户态' : '用户态 1–20 台，管理员 1–100 台';
        body += '## 业务请求字段\n\n| 字段 | 要求 |\n|---|---|\n| regionId | 必填的目标资源地域；不从登录地域推导 |\n| desktopIds | 必填、非空且不重复的真实云桌面 ID 数组；' + limit + '；超过数量拒绝，不自动拆分写请求 |\n';
        if (name !== 'delete') body += '| clientToken | 仅用户态；1–64 个可打印 ASCII 字符且不能全为空白，省略时本次调用生成一个 UUID；不据此自动重试 |\n';
        if (name === 'stop') body += '| stoppedMode | 仅管理员关机；StopCharging / KeepCharging；省略保留服务端默认行为 |\n';
        if (['stop', 'reboot'].includes(name)) body += '| osUpdate | 可选布尔；显式 false 原样发送，省略不发送 |\n';
        if (name === 'reset') body += '| imageId | 用户态必填；管理员可省略，由服务端决定默认镜像 |\n| operateType | 可选，当前只接受 replace；按实际服务规则替换数据盘 |\n';
        body += '\nGo 字段使用 RegionID / DesktopIDs 等本语言名称，见下方真实签名和 DTO。请求不能自带凭据或协议版本；本操作不接受的字段会在发送前拒绝。\n\n';
        if (name === 'reset') body += '管理员省略 imageId：JS 不设置或使用 undefined，Go 使用空字符串，Java 使用 null；显式空白值不作为有效镜像。重置会初始化系统盘，替换镜像或数据盘的实际效果按服务端规则确认。\n\n';
    }
    if (op.method && /^(list|describeWyDrives|describeWyDriveFiles|describeCreditPackageAgents)/.test(op.method)) body += '列表分页统一使用 limit 和 cursor，结果从 items 和 nextCursor 读取；不同语言的参数位置见 [列表查询与分页](/domain-model/page)。\n\n';
    if (op.id === 'conversationmanager.getconversation') body += '## 读取策略\n\n默认读取缓存。JS 在请求中设置 consistency: \"refresh\"；Go 使用可选 `model.ReadOptions{Consistency: \"refresh\"}`；Java 使用 ReadOptions 重载；Android/iOS 在 request 中设置 consistency。CLI 通过 --consistency refresh 选择刷新。\n\n';
    if (op.id === 'runtimemanager.listruntimes') body += '返回一页 Runtime：items 是当前页，nextCursor 用于继续查询。分页参数为 limit（默认50，1..100）和 cursor；认证/目录加载失败按错误返回。见 [列表查询与分页](/domain-model/page)。subscribeRuntimes 仍携带同步状态。\n\n';
    if (op.deprecated)
        body += '<Warning>至少一个语言声明标记了废弃；请按下方绑定与语言签名核对。</Warning>\n\n';
    body += '## 语言与授权\n\n| 语言 | 公开入口 | 状态 |\n|---|---|---|\n';
    for (const language of Object.keys(sources)) {
        const bindings = op.bindings.filter(e => e.language === language);
        body += '| ' + langNames[language] + ' | ' + (bindings.length ? [...new Set(bindings.map(e => '`' + (language === 'cli' ? 'wuying ' + e.name : e.owner + '.' + e.name) + '`'))].join('、') : '本基线未匹配到相同命名/合同，查语言清单确认替代入口') + ' | ' + (bindings.length ? (op.unsupported ? '当前通用集成不支持' : bindings.some(e => e.deprecated) ? '含废弃声明' : '已公开声明，需核对环境能力') : '—') + ' |\n';
    }
    for (const method of mobileReference.bindingsFor(mobile, op)) {
        for (const [language, label] of [['android', 'Android'], ['ios', 'iOS']]) {
            const route = 'reference/' + language + '/models/' + method.name.split('.')[0].toLowerCase() + '#' + method.name.split('.')[1].toLowerCase();
            body += '| ' + label + ' | [`Methods.' + method.constants[language] + '`](/' + route + ') via `Client.request` | ' + (op.unsupported ? '当前通用集成不支持' : '移动 JSON 声明，需配套原生制品与环境能力') + ' |\n';
        }
    }
    body += '\n' + (op.group === 'auth' || op.group === 'cloud-api' ? '服务端签名入口的凭据保留在受信任后端，授权与取票限制见[授权与认证](/integration/01-auth-and-lifecycle)。' : ['admin', 'transport', 'mobile'].includes(op.group) ? '这是语言专属或高级宿主入口。按对应语言的身份、配置与生命周期合同接入；普通应用从根 Client 和 Manager 开始，不借此绕过资源授权。' : '使用与当前身份相符的 Client，由宿主确认目标资源和访问范围。服务端代用户调用仍遵守用户态身份边界，见[授权与认证](/integration/01-auth-and-lifecycle)。') + '\n\n## 完整公开签名\n\n';
    const displayed = new Set();
    for (const language of Object.keys(sources))
        for (const binding of op.bindings.filter(e => e.language === language)) {
            const key = language + binding.signatures.join('\n');
            if (displayed.has(key))
                continue;
            displayed.add(key);
            body += '### ' + langNames[language] + ' · ' + safe(binding.owner) + '\n\n' + fence(codeLang[language], binding.signatures.join('\n')) + '\n';
        }
    const js = preferredJS(op);
    body += schemas(js);
    body += '## 结果、错误与生命周期\n\n以本语言签名中的实际返回包装为准。快照保留投影；订阅结束释放订阅；本地超时不代表远端未执行或已取消。涉及消息、交互与配置写入时，按原身份和实际回执核对结果。\n\n';
    body += '[Go 原始签名](/reference/go/api) · [Java 原始签名](/reference/java/api) · [JS 原始类型](/reference/js/types) · [CLI 命令说明](/reference/cli/commands)\n\n';
    body += '[模型与能力边界](/' + op.modelPage + ') · [错误与恢复](/domain-model/12-errors-examples) · [完整覆盖清单](/api-reference/coverage/index)\n';
    outputs.set(op.route + '.mdx', body);
}
const sdkOwnerPages = {};
for (const [language, data] of Object.entries(sources)) {
    const owners = [...new Set(data.entries.filter(e => e.role === 'operation').map(e => e.owner))].sort();
    sdkOwnerPages[language] = [];
    for (const originalOwner of owners) {
        const members = data.entries.filter(e => e.owner === originalOwner);
        const label = language === 'java' ? originalOwner.split('.').at(-1) : language === 'go' ? (members[0].source_owner || originalOwner) : originalOwner;
        const route = 'reference/' + language + '/classes/' + api.slug(originalOwner);
        let text = fmt(label, langNames[language] + ' 公开成员及重载。');
        text += '此页按本语言的公开声明列出成员。完整调用前提与认证方式见[SDK Client](/getting-started/initialize-client)；通过根 Client 取得 Manager，不实例化需要内部实现参数的辅助构造。语言专属的管理员与移动桥接接口按其原生配置使用。\n\n';
        for (const entry of members) {
            text += '## ' + safe(entry.name) + (entry.static ? ' · static' : '') + '\n\n' + fence(codeLang[language], entry.signatures.join('\n')) + '\n';
            const op = representation.get(entry.id);
            if (op)
                text += '[查看操作或完整契约](/' + op + ')\n\n';
        }
        outputs.set(route + '.mdx', text);
        sdkOwnerPages[language].push(route);
    }
}
const rows = [];
const countData = {};
for (const [language, data] of Object.entries(sources)) {
    const root = ledgerRoute(language);
    let body = fmt(langNames[language] + ' 完整公开清单', '按原始声明核对所有公开调用入口，包括配置、DTO、回调与辅助方法。');
    body += '本页完整列出当前快照中的公开函数、方法与命令，包含重载。业务操作按模型拆页；构造、配置、DTO/错误辅助、回调契约等保留完整签名，不当作新的资源操作。\n\n';
    if (language === 'js')
        body += '统计范围是根模块导出及根 Client 各 Manager 的可调用返回接口（包含继承方法）；全量类型与数据字段见[同版本声明](/reference/js/types)。\n\n';
    if (language === 'go')
        body += '统计非 internal 的库包，含 mobile 绑定及公开业务方法；排除示例、生成工具与测试程序。\n\n';
    if (language === 'java')
        body += '统计交付 jar 中 public 类/接口的公开方法与构造，包含重载，排除编译产生的非 public 类。配置、DTO、回调及高级宿主接口分别标明。\n\n';
    if (language === 'cli')
        body += '统计当前 CLI 显式注册的所有命令及子命令。分组入口与可执行叶命令分别列出；以下签名来自静态注册，不执行命令。\n\n';
    if (language === 'cli')
        body += '## 全局选项\n\n' + fence('sh', sources.cli.snapshot.global_options.map(o => (o.required ? 'required ' : 'optional ') + o.flags + ' — ' + o.description + (o.default ? ' (default: ' + o.default + ')' : '')).join('\n')) + '\n以上为通用注册默认值；asp open 未显式传 --timeout 时，生命周期覆盖为 3600000ms（1小时）。\n\nCLI 框架的 help / --help 与 --version 用于查看帮助和版本，不计作业务 API；以安装包帮助为准。\n\n';
    for (const entry of data.entries) {
        body += '<a id="' + anchor(entry) + '" />\n\n### ' + safe(entry.owner + '.' + entry.name) + '\n\n';
        const where = representation.get(entry.id);
        body += '类别：' + (operations.has(identity(entry)) ? '模型操作' : '类型、配置、构造、回调或辅助入口') + '。' + (where.startsWith(root + '#') ? '' : '[按模型查看操作](/' + where + ')。') + (entry.deprecated ? ' **声明标记废弃。**' : '') + '\n\n';
        body += fence(codeLang[language], entry.signatures.join('\n')) + '\n';
    }
    outputs.set(root + '.mdx', body);
    countData[language] = { public_entries: data.entries.length, public_signatures: data.entries.reduce((n, e) => n + e.signatures.length, 0), represented_entries: data.entries.filter(e => representation.has(e.id)).length, model_entries: data.entries.filter(e => operations.has(identity(e))).length, auxiliary_entries: data.entries.filter(e => !operations.has(identity(e))).length, missing: [] };
    if (countData[language].public_entries !== countData[language].represented_entries)
        throw Error('Missing public API coverage: ' + language);
    rows.push('| [' + langNames[language] + '](/' + root + ') | ' + countData[language].public_entries + ' | ' + countData[language].public_signatures + ' | 0 |');
}
const native = mobileReference.render(mobile, operations, outputs, fmt, fence);
const coverageRoute = 'api-reference/coverage/index';
let coverage = fmt('Coverage', '核对公开入口、语言差异与覆盖范围，避免把声明数量等同于运行能力。');
coverage += '本次是 **RuntimeManager 首版未提交草稿**，基础提交为 `' + ref.sdk_source_commit + '`；完整输入以源码归档 SHA-256 `' + ref.source_archive_sha256 + '` 标识，不能据基础 SHA 使用旧制品。\n\n| 语言 | 公开入口/成员条目 | 签名数（含重载） | 未文档化 |\n|---|---:|---:|---:|\n' + rows.join('\n') + '\n\n';
coverage += '每个条目都有模型操作页或完整语言清单落点。覆盖声明不代表所有环境都具备运行能力；已知不支持和废弃分别标注，未实际执行的 API 不宣称在线验收。\n\n## 统计口径\n\n- 模型操作覆盖根 Client、各 Manager、流/订阅对象、服务端签名、语言专属高级入口和 CLI 叶命令。\n- 构造、工厂、配置、DTO/错误辅助与回调实现契约仍完整列在语言清单，避免把它们混作资源操作。\n- 不包括 internal 私有实现、非 public Java 编译类、测试/示例/生成工具，或尚未交付的规划接口。\n- Java 以当前 public 签名和源注解快照为准；Go 包含公开类型别名的可见方法；JS 包含 Manager 返回接口的继承方法。\n\n## 更新检查\n\n声明变化后重新快照并生成；覆盖检查要求所有已发现公开条目有文档落点，并校验生成内容。覆盖清单和模型页使用同一输入基线，完整语言参考保持原有地址。\n';
coverage += '\n## Android 与 iOS 移动绑定\n\n两端各有 **' + mobile.methods.length + ' 个方法常量**，经统一 Client.request 调用，来自同一哈希校验的草稿归档内 Go mobile 清单；不与上表的构造、DTO、重载成员数量相加。全部方法映射到模型操作，公开包装接口另列。当前原生目录也来自本次草稿输入归档；AAR/XCFramework 仍需重新构建，来源与制品验证限制见[移动合同](/reference/mobile/contract)。\n\n[Android 完整目录](/reference/android/public) · [iOS 完整目录](/reference/ios/public)\n';
outputs.set(coverageRoute + '.mdx', coverage);
// Capability categories are owned by the Docs authoring navigation, not a second taxonomy.
const categories = modelNavigation.pages.filter(node => typeof node === 'object');
const categoryForPage = new Map();
function pagesIn(node) {
    if (typeof node === 'string') return [node];
    return node.pages.flatMap(pagesIn);
}
for (const category of categories)
    for (const page of pagesIn(category)) categoryForPage.set(page, category.group);
const buckets = new Map(['公共入口', ...categories.map(c => c.group)].map(name => [name, new Map()]));
const sdkOnly = { cli: [], mobile: [] };
function place(category, label, route, child) {
    const section = buckets.get(category);
    if (!section) throw Error('Unclassified API navigation category: ' + category);
    if (!section.has(label)) section.set(label, { routes: [], children: new Map() });
    const item = section.get(label);
    if (!child) item.routes.push(route);
    else {
        if (!item.children.has(child)) item.children.set(child, []);
        item.children.get(child).push(route);
    }
}
function pageTitle(page) {
    const filename = path.join(docs, page + '.mdx');
    const title = /^title:\s*(.+)$/m.exec(fs.readFileSync(filename, 'utf8'));
    return title ? JSON.parse(title[1]) : page;
}
place('公共入口', 'Client', 'api-reference/client/create');
for (const op of [...operations.values()].sort((a,b) => a.route.localeCompare(b.route))) {
    if (op.group === 'cli' || op.group === 'mobile') {
        sdkOnly[op.group].push(op.route);
        continue;
    }
    if (op.group === 'receipts' && op.modelPage === 'domain-model/command-receipt') {
        place('AI 能力', 'Conversation', op.route, 'CommandReceipt');
        continue;
    }
    if (op.group === 'configuration') { place('AI 能力', 'Conversation', op.route, 'Config'); continue; }
    if (op.group === 'streams') { place('AI 能力', 'Message', op.route, 'MessageStream'); continue; }
    if (op.group === 'subscriptions') { place('公共入口', 'Client', op.route, 'Subscription'); continue; }
    if (op.group === 'sync' || op.group === 'transport') throw Error('Internal transport/sync operation entered the customer API snapshot: ' + op.id);
    const category = categoryForPage.get(op.modelPage) || (op.modelPage === 'getting-started/initialize-client' ? '公共入口' : undefined);
    const label = !categoryForPage.has(op.modelPage) && ['client', 'auth', 'cloud-api', 'admin', 'transport', 'mobile', 'cli'].includes(op.group) ? models[op.group][0] : pageTitle(op.modelPage);
    place(category, label, op.route);
}
const coverageRouteLabel = '开始';
const groups = [{group: coverageRouteLabel, pages: ['api-reference/index', coverageRoute]}];
let index = fmt('API Reference', '按云资源、AI 能力、存储能力与计量查找当前 SDK 公开操作。', '接口目录');
index += '当前共收录 **' + operations.size + ' 项公开操作**，包含业务操作、CLI 命令与高级集成入口。业务能力与 Docs 使用相同的四类划分；Client 与认证单列。会话配置与操作回执放在 Conversation 下，消息流在 Message 下，订阅句柄在 Client 下。\n\n[全量覆盖与来源](/api-reference/coverage/index) · [按语言查看](/sdk-reference/index)\n\nCLI 专属命令见 [CLI Reference](/reference/cli/public)。Android / iOS 应用优先使用各自的 [Android SDK](/reference/android/client) / [iOS SDK](/reference/ios/client)；底层 Mobile 桥接见[移动合同](/reference/mobile/contract#底层移动桥接)。底层入口不再混排在业务能力目录中，原操作地址仍保留。\n';
for (const [category, labels] of buckets) {
    if (!labels.size) continue;
    const children = [];
    index += '\n## ' + category + '\n\n| 模型或用途 | 目录入口数 |\n|---|---:|\n';
    const definition = categories.find(c => c.group === category);
    const order = definition ? pagesIn(definition).map(pageTitle) : [];
    const orderedLabels = [...labels].sort(([a], [b]) => {
        const rank = label => order.includes(label) ? order.indexOf(label) : order.length;
        return rank(a) - rank(b);
    });
    for (const [label, item] of orderedLabels) {
        const pages = [...item.routes, ...[...item.children].map(([group, routes]) => ({group, pages: routes}))];
        children.push({group: label, pages});
        const routes = [...item.routes, ...[...item.children.values()].flat()];
        index += '| [' + label + '](/' + routes[0] + ') | ' + routes.length + ' |\n';
        for (const [child, childRoutes] of item.children)
            index += '| ↳ [' + child + '](/' + childRoutes[0] + ') | ' + childRoutes.length + ' |\n';
    }
    groups.push({group: category, pages: children});
}
index += '\nSDK 内部负责消息传输与历史同步，客户通过 Client 与业务 Manager 集成。目录父项数量包含子项，不能将父项与子项重复相加。目录入口含少量初始化与选择说明页，数量不等于独立业务操作数。方法名、签名和语言差异来自当前源码声明；分类不新增 Manager、认证权限或未交付能力。\n';
outputs.set('api-reference/index.mdx', index);
// Every operation remains discoverable once in its model or dedicated SDK section.
const navigationRoutes = [...groups.flatMap(pagesIn), ...sdkOnly.cli, ...sdkOnly.mobile];
for (const op of operations.values())
    if (navigationRoutes.filter(route => route === op.route).length !== 1)
        throw Error('Operation must have exactly one navigation owner: ' + op.route);
const coverageJSON = { sdk_source_state: ref.sdk_source_state, sdk_source_commit: ref.sdk_source_commit, source_archive_sha256: ref.source_archive_sha256, operations: operations.size, languages: countData, mobile_bindings: native.coverage, bindings: entries.map(e => ({ id: e.id, language: e.language, owner: e.owner, name: e.name, signatures: e.signatures, role: e.role, deprecated: e.deprecated, document: representation.get(e.id) })) };
// Validate every path and all prior ownership before any write.
const manifestPath = path.join(project, 'api-operation-manifest.json');
const prior = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const previous = prior.generated_sha256 || {};
const resolve = relative => {
    if (!/^(api-reference\/[a-z0-9/._-]+|reference\/(?:(js|go|java|cli)\/(public|classes\/[a-z0-9-]+)|(android|ios)\/(public|models\/[a-z0-9-]+)))\.mdx$/.test(relative) || relative.split('/').includes('..'))
        throw Error('Unsafe generated path');
    let current = docs;
    for (const component of relative.split('/')) {
        if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
            throw Error('Symlink output rejected');
        current = path.join(current, component);
    }
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
        throw Error('Symlink output rejected');
    return current;
};
for (const [relative, expected] of Object.entries(previous)) {
    const target = resolve(relative);
    if (fs.existsSync(target) && api.hash(fs.readFileSync(target)) !== expected)
        throw Error('Generated page was edited: ' + relative);
}
for (const relative of outputs.keys()) {
    const target = resolve(relative);
    if (fs.existsSync(target) && !(relative in previous))
        throw Error('Refusing unowned page: ' + relative);
}
const configPath = path.join(docs, 'docs.json');
if (fs.lstatSync(configPath).isSymbolicLink())
    throw Error('Symlink configuration rejected');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (JSON.stringify(config.navigation.tabs.find(t => t.tab === 'Docs')?.groups.find(g => g.group === '领域模型')) !== JSON.stringify(modelNavigation))
    throw Error('Stale domain model navigation; run import-reference.py first');
const guideGroups = config.navigation.tabs.find(t => t.tab === 'Guides')?.groups.filter(g => guideNavigation.groups.some(expected => expected.group === g.group));
if (JSON.stringify(guideGroups) !== JSON.stringify(guideNavigation.groups)) throw Error('Stale integration guide navigation; run import-reference.py first');
const tabs = config.navigation.tabs.filter(t => t.tab === 'API Reference');
if (tabs.length !== 1)
    throw Error('Expected one API Reference tab');
tabs[0].groups = groups;
const sdk = config.navigation.tabs.find(t => t.tab === 'SDK Reference');
if (!sdk)
    throw Error('Missing SDK Reference tab');
delete sdk.groups;
sdk.dropdowns = [
    { dropdown: 'SDK (JavaScript / TypeScript)', icon: 'js', groups: [{ group: '开始', pages: ['sdk-reference/index', 'sdk-reference/js', 'domain-model/language-bindings'] }, { group: '接口与类型', pages: sdkOwnerPages.js }, { group: '完整契约', pages: ['reference/js/public', 'reference/js/api', 'reference/js/types'] }] },
    { dropdown: 'SDK (Go)', icon: 'golang', groups: [{ group: '开始', pages: ['sdk-reference/go'] }, { group: '接口与类型', pages: sdkOwnerPages.go }, { group: '完整契约', pages: ['reference/go/public', 'reference/go/api'] }] },
    { dropdown: 'SDK (Java)', icon: 'java', groups: [{ group: '开始', pages: ['sdk-reference/java'] }, { group: '接口与类型', pages: sdkOwnerPages.java }, { group: '完整契约', pages: ['reference/java/public', 'reference/java/api'] }] },
    { dropdown: 'CLI', icon: 'terminal', groups: [{ group: '开始', pages: ['sdk-reference/cli', 'guides/cli-skills'] }, { group: '命令', pages: sdkOwnerPages.cli }, { group: '完整契约', pages: ['reference/cli/public', 'reference/cli/commands'] }] }
];
sdk.dropdowns.splice(3, 0, ...native.dropdowns);
sdk.dropdowns.find(d => d.dropdown === 'CLI').groups.splice(1, 0, {group: '命令用途与选项', pages: sdkOnly.cli});
sdk.dropdowns.find(d => d.dropdown === 'SDK (Go)').groups.push({group: '移动桥接（高级）', pages: sdkOnly.mobile});
const inputHashes = Object.fromEntries(['scripts/api-descriptions.json', 'content/domain-model/navigation.json', 'scripts/lib/public-api.cjs', 'scripts/lib/mobile-reference.cjs', 'scripts/snapshot-mobile-api.py', 'scripts/public-api-inputs/mobile.json', 'scripts/public-api-inputs/go.json', 'scripts/public-api-inputs/cli.json', 'scripts/public-api-inputs/java-source.json', 'docs/reference/java/api.mdx', 'docs/downloads/reference/js/index.d.ts.txt'].map(n => [n, api.hash(fs.readFileSync(path.join(project, n)))]));
const manifest = { sdk_source_state: ref.sdk_source_state, source_archive_sha256: ref.source_archive_sha256, input_sha256: inputHashes, sdk_source_commit: ref.sdk_source_commit, declaration_sha256: sources.js.source_sha256, catalog_sha256: api.hash(fs.readFileSync(path.join(project, 'scripts/api-models.json'))), generator_sha256: api.hash(fs.readFileSync(__filename)), operation_count: operations.size, mobile_coverage: Object.fromEntries(Object.entries(native.coverage).map(([k,v]) => [k, {method_constants:v.method_constants, documented_methods:v.documented_methods, missing:v.missing}])), coverage: countData, generated_sha256: Object.fromEntries([...outputs].map(([file, text]) => [file, api.hash(text)])) };
if (check) {
    for (const [relative, text] of outputs) {
        const target = resolve(relative);
        if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text)
            throw Error('Stale or missing operation document: ' + relative);
    }
    if (JSON.stringify(JSON.parse(fs.readFileSync(configPath, 'utf8')).navigation.tabs.find(t => t.tab === 'SDK Reference')) !== JSON.stringify(sdk))
        throw Error('Stale SDK language switcher');
    if (JSON.stringify(prior) !== JSON.stringify(manifest))
        throw Error('Stale manifest');
    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (JSON.stringify(current.navigation.tabs.find(t => t.tab === 'API Reference').groups) !== JSON.stringify(groups))
        throw Error('Stale navigation');
    if (JSON.stringify(JSON.parse(fs.readFileSync(path.join(project, 'api-coverage.json'), 'utf8'))) !== JSON.stringify(coverageJSON))
        throw Error('Stale coverage ledger');
    console.log('Full public API coverage check passed.');
    process.exit(0);
}
for (const relative of Object.keys(previous))
    if (!outputs.has(relative))
        fs.rmSync(resolve(relative), { force: true });
for (const [relative, text] of outputs) {
    const target = resolve(relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
}
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(project, 'api-coverage.json'), JSON.stringify(coverageJSON, null, 2) + '\n');
console.log(JSON.stringify({ operations: operations.size, generated_pages: outputs.size, languages: countData }));

