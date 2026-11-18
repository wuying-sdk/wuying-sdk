// Native references consume the one Go mobile method registry; no SDK implementation is copied.
const fs = require('node:fs'), path = require('node:path');
const api = require('./public-api.cjs');
exports.load = (project, commit, archiveHash) => {
    const data = JSON.parse(fs.readFileSync(path.join(project, 'scripts/public-api-inputs/mobile.json'), 'utf8'));
    if (data.sdk_source_commit !== commit || data.schema_version !== 1 || (archiveHash && data.source_archive_sha256 !== archiveHash)) throw Error('Mixed mobile snapshot');
    if (new Set(data.methods.map(m => m.name)).size !== data.methods.length) throw Error('Duplicate mobile methods');
    for (const language of ['android', 'ios'])
        if (new Set(data.methods.map(m => m.constants[language])).size !== data.methods.length || data.methods.some(m => !/^[A-Za-z]\w*$/.test(m.constants[language]))) throw Error('Invalid mobile constants');
    return data;
};
exports.bindingsFor = (data, op) => data.methods.filter(m => {
    const match = /^\*(\w+)\.(\w+)$/.exec(m.goMethod);
    if (!match) throw Error('Unexpected Go mobile target: ' + m.goMethod);
    return api.normal(match[1]) + '.' + api.normal(match[2]) === op.id;
});
exports.render = (data, operations, outputs, fmt, fence) => {
    const labels = { agent: 'AgentManager', conversation: 'ConversationManager', attachment: 'AttachmentManager', workspace: 'WorkspaceManager', skill: 'SkillManager', runtime: 'RuntimeManager', credit: 'CreditManager' };
    const groups = [...new Set(data.methods.map(m => m.name.split('.')[0]))];
    const mapping = new Map();
    for (const op of operations.values()) for (const m of exports.bindingsFor(data, op)) mapping.set(m.name, op);
    if (mapping.size !== data.methods.length) throw Error('Mobile method has no model operation');
    const dropdowns = [], coverage = {};
    for (const language of ['android', 'ios']) {
        const label = language === 'android' ? 'Android' : 'iOS';
        const root = 'reference/' + language;
        const modelPages = groups.map(g => root + '/models/' + g.toLowerCase());
        dropdowns.push({ dropdown: 'SDK (' + label + ')', icon: language === 'android' ? 'android' : 'apple', groups: [
            { group: '开始', pages: ['sdk-reference/' + language, root + '/client'] },
            { group: '模型与方法', pages: modelPages },
            { group: '完整契约', pages: [root + '/public', ...(language === 'android' ? ['reference/mobile/contract'] : [])] }
        ] });
        let index = fmt(label + ' Methods', '当前移动绑定的全部方法常量与模型操作，包含能力限制。');
        index += '当前共有 **' + data.methods.length + ' 个 JSON 方法入口**。调用方式为 `Client.request` 加 `Methods` 常量，并非每个方法都有同名 Java / Swift 成员函数。公开包装类型见 [Client 与事件](/' + root + '/client)。这份清单与服务端 Java SDK、JS SDK 分别核对，不代表功能完全相同。\n\n';
        index += '| 模型 | 方法数 |\n|---|---:|\n';
        const bindings = [];
        for (const group of groups) {
            const methods = data.methods.filter(m => m.name.startsWith(group + '.'));
            const route = root + '/models/' + group.toLowerCase();
            index += '| [' + labels[group] + '](/' + route + ') | ' + methods.length + ' |\n';
            let body = fmt(labels[group], label + ' · 当前移动绑定的完整方法列表。');
            body += '通过同一 Client 调用下列 `Methods` 常量。请求与结果沿用 Go 移动 JSON 合同；下面的 Go 签名用于定位 DTO，**不是原生 Java / Swift 签名**。授权、请求封装、事件与取消规则见[移动合同](/reference/mobile/contract)，调用示例见[Client](/' + root + '/client)。\n\n';
            for (const method of methods) {
                const op = mapping.get(method.name);
                const anchor = method.name.split('.')[1].toLowerCase();
                const document = route + '#' + anchor;
                body += '<a id="' + anchor + '" />\n\n## Methods.' + method.constants[language] + '\n\n';
                body += '`Methods.' + method.constants[language] + '` → `' + method.name + '`\n\n';
                body += '**模式：** `' + method.mode + '`。**请求类型：** ' + (method.request ? '`' + method.request + '`' : '无业务字段（空对象）') + '。**MutationOptions：** ' + (method.options ? '支持；原生 `mutationId` 参数用于该选项' : '不支持；省略 `mutationId`') + '。\n\n';
                body += fence('go', method.goMethod + '\n' + method.signature) + '\n';
                body += '[模型操作、完整参数与能力边界](/' + op.route + ') · [Go DTO 参考](/reference/go/api)\n\n';
                bindings.push({ method: method.name, constant: 'Methods.' + method.constants[language], mode: method.mode, document, model_document: op.route, unsupported: op.unsupported });
            }
            outputs.set(route + '.mdx', body);
        }
        index += '\n两个移动端共用同一清单，重复计数不表示新增独立业务能力。新云管理入口也需对应版本的原生制品与上游能力支持。\n\n[版本与验证范围](/reference/mobile/contract#版本与验证范围)\n';
        outputs.set(root + '/public.mdx', index);
        coverage[language] = { method_constants: bindings.length, documented_methods: bindings.length, missing: [], bindings };
    }
    return { dropdowns, coverage };
};
