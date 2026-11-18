#!/usr/bin/env python3
"""Extract public signature inputs without importing SDK implementation files into docs."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import os
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--draft-archive', required=True, type=Path)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
for relative in ['scripts', 'scripts/public-api-inputs', 'scripts/public-api-inputs/go.json', 'scripts/public-api-inputs/cli.json', 'scripts/public-api-inputs/java-source.json']:
    if (project / relative).is_symlink():
        raise SystemExit('Symlink snapshot output rejected: ' + relative)
reference = json.loads((project / 'reference-content-manifest.json').read_text())
archive_hash = hashlib.sha256(args.draft_archive.read_bytes()).hexdigest()
if archive_hash != reference['source_archive_sha256']:
    raise SystemExit('Archive differs from the reviewed delivery snapshot')
with tempfile.TemporaryDirectory(prefix='wuying-api-contracts-') as folder:
    temp = Path(folder)
    with zipfile.ZipFile(args.draft_archive) as archive:
        roots = {name.split('/')[0] for name in archive.namelist()}
        if len(roots) != 1:
            raise ValueError('Expected one archive root')
        root = next(iter(roots)) + '/'
        prefix = root + 'wuying-sdk-go/'
        java_hashes = {}
        java_prefix = root + 'wuying-sdk-java/src/main/java/'
        for item in archive.infolist():
            if item.filename.startswith(java_prefix) and item.filename.endswith('.java'):
                relative = Path(item.filename[len(java_prefix):])
                target = temp / 'java' / relative
                if relative.is_absolute() or '..' in relative.parts or ((item.external_attr >> 16) & 0o170000) == 0o120000:
                    raise ValueError('Unsafe Java source member')
                data = archive.read(item)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                java_hashes['src/main/java/' + relative.as_posix()] = hashlib.sha256(data).hexdigest()
        for info in archive.infolist():
            name = info.filename
            if not name.startswith(prefix) or not (name.endswith('.go') or name.endswith('/go.mod') or name.endswith('/go.sum')) or name.endswith('_test.go'):
                continue
            relative = Path(name[len(prefix):])
            target = temp / 'go' / relative
            if relative.is_absolute() or '..' in relative.parts or ((info.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError('Unsafe source member')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))
        cli_prefix = root + 'wuying-sdk-cli/src/'
        for item in archive.infolist():
            if not item.filename.startswith(cli_prefix) or not item.filename.endswith('.mjs'):
                continue
            relative = Path(item.filename[len(cli_prefix):])
            if relative.is_absolute() or '..' in relative.parts or ((item.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError('Unsafe CLI source member')
            target = temp / 'cli' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(item))
    result = subprocess.run(['go', 'run', str(project / 'scripts/snapshot-go-public-api.go'), str(temp / 'go')], capture_output=True, text=True, check=True)
    go = json.loads(result.stdout)
    verification = subprocess.run(['go', 'run', str(project / 'scripts/verify-go-public-api.go'), str(temp / 'go')], capture_output=True, text=True, check=True)
    compiler = json.loads(verification.stdout)
    ast_ids = {e['package'] + '.' + e['owner'] + '.' + e['name'] for e in go['entries']}
    compiler_ids = set(compiler['compiler_public_callable_ids'])
    if ast_ids != compiler_ids:
        raise ValueError('Go AST/compiler mismatch: missing=' + repr(sorted(compiler_ids - ast_ids)) + '; extra=' + repr(sorted(ast_ids - compiler_ids)))
    go['compiler_verified_ids'] = compiler['compiler_public_callable_ids']
    go['source_archive_sha256'] = archive_hash
    go['sdk_source_commit'] = reference['sdk_source_commit']
    destination = project / 'scripts/public-api-inputs'
    destination.mkdir(exist_ok=True)
    java_command = str(Path(os.environ['JAVA_HOME']) / 'bin/java') if os.environ.get('JAVA_HOME') else 'java'
    java_result = subprocess.run([java_command, str(project / 'scripts/SnapshotJavaSource.java'), str(temp / 'java')], capture_output=True, text=True, check=True)
    java = json.loads(java_result.stdout)
    java.update(source_archive_sha256=archive_hash, sdk_source_commit=reference['sdk_source_commit'], input_sha256=java_hashes)
    (destination / 'java-source.json').write_text(json.dumps(java, ensure_ascii=False, indent=2) + '\n')
    (destination / 'go.json').write_text(json.dumps(go, ensure_ascii=False, indent=2) + '\n')
    subprocess.run(['node', str(project / 'scripts/snapshot-cli-api.cjs'), str(temp / 'cli/main.mjs'), str(destination / 'cli.json'), archive_hash, reference['sdk_source_commit']], check=True)
print('Updated public Go signatures and CLI command schema; no SDK implementation copied into the site.')
