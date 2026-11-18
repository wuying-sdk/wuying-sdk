const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(t, names = "['create', 'start']") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wuying-cli-schema-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'main.mjs'), `
import { registerDesktops } from './desktops.mjs';
export function main() {
  const program = new Command();
  const handle = command => command;
  const auth = program.command('auth');
  ${Array.from({ length: 15 }, (_, i) => `handle(program.command('existing${i}'));`).join('\n')}
  registerDesktops(program, { auth, handle });
}`);
    fs.writeFileSync(path.join(dir, 'desktops.mjs'), `
export function registerDesktops(program, { auth, handle }) {
  const input = command => command.option('--request-file <path>', 'Request JSON').option('--stdin', 'Read stdin');
  const desktops = program.command('desktops');
  for (const method of ${names}) {
    const command = input(desktops.command(method));
    if (method === 'create') command.option('--wait', 'Wait for readiness');
    handle(command, () => { throw new Error('Actions must never execute'); });
  }
  handle(input(auth.command('code')), () => { throw new Error('No SDK calls'); });
}`);
    return dir;
}

test('snapshots imported registration loops, helpers and conditional options without running actions', t => {
    const dir = fixture(t), output = path.join(dir, 'out.json');
    const result = spawnSync(process.execPath, [path.join(__dirname, 'snapshot-cli-api.cjs'), path.join(dir, 'main.mjs'), output, 'archive', 'commit'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const schema = JSON.parse(fs.readFileSync(output, 'utf8'));
    const command = name => schema.entries.find(e => e.path.join(' ') === name);
    assert.equal(schema.entries.filter(e => e.leaf).length, 18);
    assert.deepEqual(command('desktops create').options.map(o => o.flags), ['--request-file <path>', '--stdin', '--wait']);
    assert.deepEqual(command('desktops start').options.map(o => o.flags), ['--request-file <path>', '--stdin']);
    assert.deepEqual(command('auth code').options.map(o => o.flags), ['--request-file <path>', '--stdin']);
    assert.equal(command('desktops').leaf, false);
    assert.deepEqual(Object.keys(schema.input_sha256).sort(), ['desktops.mjs', 'main.mjs']);
});

test('refuses dynamic command loop values instead of silently omitting APIs', t => {
    const dir = fixture(t, '[runtimeMethod]');
    const result = spawnSync(process.execPath, [path.join(__dirname, 'snapshot-cli-api.cjs'), path.join(dir, 'main.mjs'), path.join(dir, 'out.json'), 'archive', 'commit'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Dynamic CLI registration loop requires review/);
    assert.equal(fs.existsSync(path.join(dir, 'out.json')), false);
});

test('includes command/method tuple registrations without executing SDK callbacks', t => {
    const dir = fixture(t), input = path.join(dir, 'desktops.mjs');
    fs.appendFileSync(input, `
export function registerCommands(program) {
  const runtimes = program.command('runtimes');
  for (const [name, method] of [['run-command','runCommand'],['subscribe-command','subscribeCommand']]) {
    runtimes.command(name).option('--stdin', 'Request').action(() => { throw Error(method); });
  }
}`);
    fs.appendFileSync(path.join(dir,'main.mjs'), `
import { registerCommands } from './desktops.mjs'; registerCommands(program);`);
    const output = path.join(dir,'out.json');
    const result = spawnSync(process.execPath, [path.join(__dirname,'snapshot-cli-api.cjs'),path.join(dir,'main.mjs'),output,'archive','commit'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const schema = JSON.parse(fs.readFileSync(output,'utf8'));
    for (const name of ['runtimes run-command','runtimes subscribe-command']) {
        const command = schema.entries.find(e => e.path.join(' ') === name);
        assert.equal(command.leaf,true);
        assert.deepEqual(command.options.map(o=>o.flags),['--stdin']);
    }
});
