// Read Commander registrations statically; no CLI action or SDK code is executed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const [input, output, archiveHash, commit] = process.argv.slice(2);
const text = fs.readFileSync(input, 'utf8');
const source = ts.createSourceFile('main.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const bindings = new Map();
const registrations = new Map();
const modules = new Map();
const inputHashes = { 'main.mjs': crypto.createHash('sha256').update(text).digest('hex') };
const literal = (node, env = new Map()) => node && ts.isStringLiteralLike(node) ? node.text : node && ts.isIdentifier(node) && typeof env.get(node.text) === 'string' ? env.get(node.text) : undefined;
const copy = value => value ? { path: [...value.path], options: [...value.options], description: value.description || '' } : null;
function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
        bindings.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
}
collect(source);
// Follow imported registration functions only. Their action callbacks are never run.
for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    const relative = literal(statement.moduleSpecifier);
    if (!relative?.startsWith('./') || !relative.endsWith('.mjs')) continue;
    const filename = path.resolve(path.dirname(input), relative);
    if (!fs.existsSync(filename)) throw Error('Missing CLI registration dependency: ' + relative);
    const raw = fs.readFileSync(filename, 'utf8');
    const moduleSource = ts.createSourceFile(relative, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const specifier of statement.importClause.namedBindings.elements) {
        const exported = specifier.propertyName?.text || specifier.name.text;
        const declaration = moduleSource.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === exported && n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
        if (!declaration) continue;
        let registers = false;
        const scan = n => { if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'command') registers = true; ts.forEachChild(n, scan); };
        scan(declaration);
        if (!registers) continue;
        modules.set(specifier.name.text, declaration);
        inputHashes[relative.replace(/^\.\//, '')] = crypto.createHash('sha256').update(raw).digest('hex');
    }
}
function chain(node, env = new Map(), depth = 0) {
    if (!node || depth > 30)
        return null;
    if (ts.isIdentifier(node)) {
        if (env.has(node.text))
            return typeof env.get(node.text) === 'string' ? null : copy(env.get(node.text));
        if (node.text === 'program')
            return { path: [], options: [], description: '' };
        return chain(bindings.get(node.text), env, depth + 1);
    }
    if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node))
        return chain(node.expression, env, depth + 1);
    if (!ts.isCallExpression(node))
        return null;
    if (ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if (name === 'handle')
            return chain(node.arguments[0], env, depth + 1);
        const fn = bindings.get(name);
        if (fn && ts.isArrowFunction(fn) && fn.parameters.length === 1 && ts.isIdentifier(fn.parameters[0].name)) {
            const value = chain(node.arguments[0], env, depth + 1);
            if (!value || ts.isBlock(fn.body))
                return null;
            const local = new Map(env);
            local.set(fn.parameters[0].name.text, value);
            return chain(fn.body, local, depth + 1);
        }
        return null;
    }
    if (!ts.isPropertyAccessExpression(node.expression))
        return null;
    const value = chain(node.expression.expression, env, depth + 1);
    if (!value)
        return null;
    const method = node.expression.name.text;
    if (method === 'command') {
        const name = literal(node.arguments[0], env);
        if (!name)
            throw Error('Dynamic CLI command name requires review');
        value.path.push(name.split(/\s+/)[0]);
        value.options = [];
        value.description = '';
    }
    else if (['option', 'requiredOption'].includes(method)) {
        const flags = literal(node.arguments[0]);
        let defaultNode = node.arguments.length >= 4 ? node.arguments[3] : node.arguments[2];
        if (defaultNode && node.arguments.length < 4) {
            const declaration = ts.isIdentifier(defaultNode) ? bindings.get(defaultNode.text) : defaultNode;
            if (declaration && (ts.isArrowFunction(declaration) || ts.isFunctionExpression(declaration))) defaultNode = undefined;
            if (ts.isIdentifier(defaultNode || {}) && source.statements.some(s => ts.isFunctionDeclaration(s) && s.name?.text === defaultNode.text)) defaultNode = undefined;
        }
        const defaultValue = !defaultNode ? null : ts.isStringLiteralLike(defaultNode) || ts.isNumericLiteral(defaultNode) ? defaultNode.text : defaultNode.getText(defaultNode.getSourceFile());
        if (flags)
            value.options.push({ flags, description: literal(node.arguments[1]) || '', required: method === 'requiredOption', default: defaultValue });
    }
    else if (method === 'description')
        value.description = literal(node.arguments[0]) || value.description;
    return value;
}
function visit(node, env = new Map()) {
    // Helper arrows are resolved by chain at their call sites; action bodies do not register commands.
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
    if (ts.isForOfStatement(node) && ts.isArrayLiteralExpression(node.expression) && ts.isVariableDeclarationList(node.initializer)) {
        const name = node.initializer.declarations[0]?.name;
        if (!name || (!ts.isIdentifier(name) && !ts.isArrayBindingPattern(name))) throw Error('Unsupported CLI registration loop binding');
        for (const item of node.expression.elements) {
            const local = new Map(env);
            if (ts.isIdentifier(name)) {
                const value = literal(item, env);
                if (value === undefined) throw Error('Dynamic CLI registration loop requires review');
                local.set(name.text, value);
            } else {
                if (!ts.isArrayLiteralExpression(item) || item.elements.length !== name.elements.length) throw Error('Dynamic CLI registration tuple requires review');
                name.elements.forEach((binding, i) => {
                    const value = literal(item.elements[i], env);
                    if (!ts.isBindingElement(binding) || !ts.isIdentifier(binding.name) || value === undefined) throw Error('Dynamic CLI registration tuple requires review');
                    local.set(binding.name.text, value);
                });
            }
            visit(node.statement, local);
        }
        return;
    }
    if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
        const left = literal(node.expression.left, env), right = literal(node.expression.right, env);
        if (left !== undefined && right !== undefined) { if (left === right) visit(node.thenStatement, env); else if (node.elseStatement) visit(node.elseStatement, env); return; }
    }
    if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && modules.has(node.expression.text)) {
            const saved = new Map(bindings), declaration = modules.get(node.expression.text);
            collect(declaration.body);
            visit(declaration.body, env);
            bindings.clear(); for (const [key, value] of saved) bindings.set(key, value);
            return;
        }
        const value = chain(node, env);
        if (value) {
            const key = value.path.join(' ');
            const prior = registrations.get(key) || { path: value.path, options: [], description: '' };
            const options = new Map(prior.options.map(o => [o.flags, o]));
            for (const option of value.options)
                options.set(option.flags, option);
            registrations.set(key, { path: value.path, options: [...options.values()], description: value.description || prior.description });
        }
    }
    ts.forEachChild(node, child => visit(child, env));
}
visit(source);
const globalOptions = registrations.get('')?.options || [];
const entries = [...registrations.values()].filter(e => e.path.length).map(e => ({ ...e, leaf: ![...registrations.values()].some(other => other.path.length > e.path.length && e.path.every((x, i) => other.path[i] === x)) })).sort((a, b) => a.path.join(' ').localeCompare(b.path.join(' ')));
if (entries.length < 15)
    throw Error('Unexpectedly small command snapshot');
const result = { language: 'cli', source_archive_sha256: archiveHash, sdk_source_commit: commit, source_sha256: inputHashes['main.mjs'], input_sha256: inputHashes, global_options: globalOptions, entries };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
process.stdout.write('CLI registrations: ' + entries.length + ' (' + entries.filter(e => e.leaf).length + ' leaf commands)\n');

