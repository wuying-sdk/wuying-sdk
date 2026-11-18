const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const normal = s => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
const slug = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'operation';
function readJS(project) {
    const raw = fs.readFileSync(path.join(project, 'docs/downloads/reference/js/index.d.ts.txt'), 'utf8');
    const file = path.join(project, 'scripts/__public_surface__.d.ts');
    const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, skipLibCheck: true };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, language, ...rest) => name === file ? ts.createSourceFile(file, raw, language, true) : original(name, language, ...rest);
    const program = ts.createProgram([file], options, host);
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    const module = checker.getSymbolAtLocation(source);
    if (!module)
        throw Error('Public declaration is not a module');
    const exports = checker.getExportsOfModule(module);
    const exportedNames = new Map();
    const entries = [];
    const symbols = [];
    const surfaces = [];
    const qualify = entry => { entry.id = 'js:' + entry.owner + '.' + entry.name + (entry.static ? ':static' : '') + ':' + entry.provider.kind + (entry.provider.factory || ''); entry.language = 'js'; return entry; };
    const own = s => s.declarations?.some(d => d.getSourceFile() === source && !d.modifiers?.some(m => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind)));
    function addSurface(owner, type, provider, role, exportName) {
        const methods = [];
        for (const property of checker.getPropertiesOfType(type)) {
            if (!own(property) || property.getName() === 'prototype')
                continue;
            const decl = property.valueDeclaration || property.declarations?.[0];
            const name = decl?.name && ts.isComputedPropertyName(decl.name) ? decl.name.getText(source) : property.getName();
            const callable = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(property, decl || source));
            const signatures = callable.getCallSignatures();
            if (!signatures.length)
                continue;
            const print = signatures.map(sig => name + ((property.flags & ts.SymbolFlags.Optional) ? '?' : '') + checker.signatureToString(sig, decl, ts.TypeFormatFlags.NoTruncation, ts.SignatureKind.Call) + ';');
            const comment = ts.displayPartsToString(property.getDocumentationComment(checker));
            const item = qualify({ owner, name, signatures: print, description: comment, deprecated: property.getJsDocTags().some(t => t.name === 'deprecated'), provider, role, exportName, source_name: property.getName(), static: provider.kind === 'static' });
            entries.push(item);
            methods.push({ item, property, type: callable, signatures });
        }
        surfaces.push({ owner, type, provider, role, methods });
        return methods;
    }
    for (const exp of exports) {
        const symbol = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
        exportedNames.set(symbol, exp.name);
        const decl = symbol.declarations?.find(d => d.getSourceFile() === source);
        if (!decl)
            continue;
        symbols.push({ name: exp.name, declaration: ts.SyntaxKind[decl.kind], original: symbol.name });
        if (ts.isClassDeclaration(decl)) {
            const type = checker.getDeclaredTypeOfSymbol(symbol);
            const owner = exp.name;
            const operationClass = /^(Client|CloudClient|AgentManager|ConversationManager|AttachmentManager|WorkspaceManager|SkillManager|CreditManager|ModelManager|CloudAgentManager|AspManager)$/.test(owner);
            addSurface(owner, type, { kind: owner === 'Client' ? 'client' : 'instance', type: owner }, ['Client', 'CloudClient'].includes(owner) ? 'operation' : 'auxiliary', owner);
            const staticType = checker.getTypeOfSymbolAtLocation(symbol, decl);
            addSurface(owner, staticType, { kind: 'static', type: owner }, 'auxiliary', owner);
            const constructors = staticType.getConstructSignatures().filter(s => !s.getDeclaration()?.modifiers?.some(m => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind)));
            if (constructors.length)
                entries.push(qualify({ owner, name: 'constructor', signatures: constructors.map(s => 'new ' + checker.signatureToString(s, decl, ts.TypeFormatFlags.NoTruncation, ts.SignatureKind.Construct) + ';'), provider: { kind: 'constructor', type: owner }, role: 'auxiliary', exportName: owner, static: false, deprecated: false, description: '' }));
        }
        else if (ts.isFunctionDeclaration(decl)) {
            const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
            entries.push(qualify({ owner: 'Functions', name: exp.name, signatures: type.getCallSignatures().map(s => 'function ' + exp.name + checker.signatureToString(s, decl, ts.TypeFormatFlags.NoTruncation) + ';'), provider: { kind: 'function', name: exp.name }, role: exp.name === 'getAuthCode' ? 'operation' : 'auxiliary', exportName: exp.name, deprecated: symbol.getJsDocTags().some(t => t.name === 'deprecated'), description: ts.displayPartsToString(symbol.getDocumentationComment(checker)) }));
        }
        else if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) {
            addSurface(exp.name, checker.getDeclaredTypeOfSymbol(symbol), { kind: 'contract', type: exp.name }, 'auxiliary', exp.name);
        }
    }
    const clientSymbol = checker.getAliasedSymbol(exports.find(e => e.name === 'Client'));
    const client = checker.getDeclaredTypeOfSymbol(clientSymbol);
    for (const factory of checker.getPropertiesOfType(client).filter(s => /^build.*Manager$/.test(s.name))) {
        const sig = checker.getTypeOfSymbolAtLocation(factory, factory.valueDeclaration || source).getCallSignatures()[0];
        const type = checker.getAwaitedType(sig.getReturnType());
        const owner = factory.name.replace(/^build/, '');
        addSurface(owner, type, { kind: 'factory', factory: factory.name, type: owner }, 'operation', null);
    }
    // Contracts returned by these methods are callable SDK objects, not factories.
    for (const name of ['MessageStream', 'Subscription']) {
        const existing = entries.filter(e => e.owner === name);
        for (const entry of existing) {
            entry.role = 'operation';
            entry.provider = { kind: 'contract', type: name };
        }
        ;
    }
    // Class export methods and root-factory methods can expose the same operation.
    // Keep both bindings in the ledger; use the root-factory receiver in examples.
    const seen = new Map();
    for (const entry of entries) {
        const key = entry.id + ':' + entry.provider.kind + (entry.provider.factory || '');
        if (seen.has(key)) {
            const prior = seen.get(key);
            prior.signatures = [...new Set([...prior.signatures, ...entry.signatures])];
        }
        else
            seen.set(key, entry);
    }
    return { entries: [...seen.values()], symbols, source_sha256: hash(raw), checker, source, surfaces, program };
}
function readJava(project) {
    const raw = fs.readFileSync(path.join(project, 'docs/reference/java/api.mdx'), 'utf8');
    const deprecations = JSON.parse(fs.readFileSync(path.join(project,'scripts/public-api-inputs/java-source.json'),'utf8')).deprecated_annotations;
    const deprecated = (owner,name) => deprecations.some(d => d.owner === owner && (d.name === '*' || d.name === name));
    const classes = new Map();
    let current = null;
    for (const line of raw.split('\n')) {
        const header = line.match(/^(public\s+)?(?:(?:final|abstract|static)\s+)*(?:class|interface|enum)\s+(com\.aliyun\.wuying\.sdk\.[\w.$]+)/);
        if (header) {
            current = { name: header[2], public: !!header[1], methods: [], parents: [] };
            const tail = line.slice(line.indexOf(header[2]) + header[2].length);
            let angle = 0, collecting = false;
            for (let i = 0; i < tail.length;) {
                const char = tail[i];
                if (char === '<') {
                    angle++;
                    i++;
                    continue;
                }
                if (char === '>') {
                    angle--;
                    i++;
                    continue;
                }
                const word = tail.slice(i).match(/^[\w.$]+/);
                if (!word) {
                    i++;
                    continue;
                }
                if (angle === 0) {
                    if (word[0] === 'extends' || word[0] === 'implements')
                        collecting = true;
                    else if (collecting && word[0].startsWith('com.aliyun.wuying.sdk.'))
                        current.parents.push(word[0]);
                }
                i += word[0].length;
            }
            classes.set(current.name, current);
            continue;
        }
        if (line === '}') {
            current = null;
            continue;
        }
        if (!current || !/^\s+public /.test(line) || !line.includes('('))
            continue;
        const before = line.slice(0, line.indexOf('('));
        const method = before.trim().split(/\s+/).at(-1);
        const constructor = method === current.name;
        current.methods.push({ name: constructor ? 'constructor' : method, signature: line.trim(), static: /\bstatic\b/.test(before), constructor });
    }
    function inheritedMethods(name, seen = new Set()) {
        if (seen.has(name) || !classes.has(name))
            return [];
        seen.add(name);
        const value = classes.get(name);
        const own = value.methods.filter(m => !m.constructor).map(m => ({ ...m, declaring: name }));
        for (const parent of value.parents)
            for (const method of inheritedMethods(parent, seen)) {
                // Override matching is by method name and erased parameter spelling, never return value.
                const parameters = method.signature.slice(method.signature.indexOf('('), method.signature.indexOf(')') + 1);
                if (!own.some(m => m.name === method.name && m.signature.slice(m.signature.indexOf('('), m.signature.indexOf(')') + 1) === parameters))
                    own.push(method);
            }
        return own;
    }
    const entries = [], symbols = [];
    for (const value of classes.values()) {
        if (!value.public)
            continue;
        const owner = value.name;
        symbols.push({ name: owner });
        const short = owner.split('.').at(-1), pkg = owner.slice(0, owner.lastIndexOf('.'));
        const all = [...value.methods.filter(m => m.constructor).map(m => ({ ...m, declaring: owner })), ...inheritedMethods(owner)];
        for (const item of all) {
            const member = item.name;
            let role = 'auxiliary';
            if (pkg.endsWith('.manager') && short !== 'BaseManager' && !item.constructor)
                role = 'operation';
            if (['WuyingClient', 'CloudClient', 'AuthApi'].includes(short) && !item.constructor && !['toString', 'equals', 'hashCode'].includes(member))
                role = 'operation';
            if (pkg.endsWith('.model') && ['Subscription', 'MessageStream'].includes(short))
                role = 'operation';
            if (['AdminImClient', 'AdminWebSocketSubscription', 'AgMessageClient', 'SqliteTransportStore'].includes(short) && !item.constructor && !['toString', 'equals', 'hashCode', 'values', 'valueOf'].includes(member))
                role = 'operation';
            entries.push({ language: 'java', owner, name: member, signatures: [item.signature], static: item.static, role, description: '', deprecated: deprecated(owner,member) || deprecated(item.declaring,member), id: 'java:' + owner + '.' + member + (item.static ? ':static' : ''), source_owner: short, declaring: item.declaring });
        }
    }
    const merged = new Map();
    for (const entry of entries) {
        if (merged.has(entry.id))
            merged.get(entry.id).signatures = [...new Set([...merged.get(entry.id).signatures, ...entry.signatures])];
        else
            merged.set(entry.id, entry);
    }
    // Completeness follows stable entry points, not a minimum class count:
    // intentionally deleting public DTOs must not look like a truncated snapshot.
    const required = ['WuyingClient', 'CallContext', 'manager.AgentManager', 'manager.ConversationManager', 'manager.AttachmentManager', 'manager.WorkspaceManager', 'manager.RuntimeManager', 'manager.SkillManager', 'manager.CreditManager', 'model.Conversation', 'model.Message', 'model.Page', 'model.Subscription'];
    const names = new Set(symbols.map(s => s.name));
    const missing = required.filter(n => !names.has('com.aliyun.wuying.sdk.' + n));
    if (missing.length || names.size !== symbols.length)
        throw Error('Incomplete or duplicate Java public snapshot: ' + missing.join(', '));
    return { entries: [...merged.values()], symbols, source_sha256: hash(raw) };
}
function readGo(project) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(project, 'scripts/public-api-inputs/go.json'), 'utf8'));
    const entries = snapshot.entries.map(e => {
        let role = 'auxiliary';
        if (e.package.endsWith('/manager') && e.owner && e.owner !== 'BaseManager')
            role = 'operation';
        if (e.package.endsWith('/model') && ['Subscription', 'MessageStream'].includes(e.owner))
            role = 'operation';
        if (e.package === 'github.com/aliyun/wuying-sdk-go' && e.owner === 'Client')
            role = 'operation';
        if (e.package.endsWith('/mobile') && e.kind !== 'interface-method')
            role = 'operation';
        if (e.package.endsWith('/transport/agmessage') && e.owner === 'Client')
            role = 'operation';
        return { language: 'go', owner: e.package + (e.owner ? '.' + e.owner : ''), name: e.name, signatures: [e.signature], id: 'go:' + e.package + '.' + e.owner + '.' + e.name, role, description: e.doc || '', deprecated: /Deprecated:/.test(e.doc || ''), kind: e.kind, source_owner: e.owner || e.package.split('/').at(-1) };
    });
    return { entries, symbols: snapshot.public_packages.map(name => ({ name })), snapshot };
}
function readCLI(project) { const snapshot = JSON.parse(fs.readFileSync(path.join(project, 'scripts/public-api-inputs/cli.json'), 'utf8')); return { entries: snapshot.entries.map(e => ({ language: 'cli', owner: e.path[0], name: e.path.join(' '), id: 'cli:' + e.path.join(' '), role: e.leaf ? 'operation' : 'auxiliary', signatures: ['wuying ' + e.path.join(' ') + '\n' + e.options.map(o => (o.required ? 'required ' : 'optional ') + o.flags + ' — ' + o.description + (o.default ? ' (default: ' + o.default + ')' : '')).join('\n')], description: e.description, deprecated: false, command: e })), symbols: snapshot.entries.map(e => ({ name: e.path.join(' ') })), snapshot }; }
module.exports = { readJS, readJava, readGo, readCLI, hash, normal, slug };

