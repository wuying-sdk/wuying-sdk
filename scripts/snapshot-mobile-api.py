#!/usr/bin/env python3
"""Snapshot native method contracts from clean, same-commit SDK paths, without copying implementation."""
import argparse, hashlib, json, pathlib, re, subprocess
p = argparse.ArgumentParser()
group = p.add_mutually_exclusive_group(required=True)
group.add_argument('--source')
group.add_argument('--draft-archive')
args = p.parse_args()
project = pathlib.Path(__file__).resolve().parent.parent
ref = json.loads((project/'reference-content-manifest.json').read_text())
paths = ['wuying-sdk-go/mobile/api.json','wuying-sdk-go/docs/MOBILE_BINDING.md','wuying-sdk-android','wuying-sdk-ios']
if args.draft_archive:
 import zipfile
 archive_path = pathlib.Path(args.draft_archive)
 archive_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
 if archive_hash != ref['source_archive_sha256']: raise SystemExit('Draft archive does not match reference inputs')
 with zipfile.ZipFile(archive_path) as archive:
  roots = {n.split('/')[0] for n in archive.namelist()}
  if len(roots) != 1: raise SystemExit('Expected one archive root')
  root = roots.pop() + '/'
  state = json.loads(archive.read(root+'DRAFT_PROVENANCE.json'))
  if state['base_commit'] != ref['sdk_source_commit'] or state['kind'] != 'uncommitted-runtime-manager-draft': raise SystemExit('Unexpected mobile draft provenance')
  blobs = {}
  for info in archive.infolist():
   name = info.filename[len(root):]
   if not any(name == x or name.startswith(x+'/') for x in paths) or not name.endswith(('.java','.swift','.md','.json','.kts','.pro','.xml')): continue
   if pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or ((info.external_attr>>16)&0o170000)==0o120000 or info.file_size>2_000_000 or name in blobs: raise SystemExit('Unsafe/duplicate mobile source')
   blob = archive.read(info)
   if hashlib.sha256(blob).hexdigest() != state['source_sha256'].get(name): raise SystemExit('Mobile source hash mismatch')
   blobs[name] = blob
 commit = state['base_commit']
 source_kind = 'hash-verified RuntimeManager working-tree draft archive; base commit is not the full source identity'
else:
 source = pathlib.Path(args.source).resolve()
 def git(*args): return subprocess.check_output(['git', *args], cwd=source)
 commit = git('rev-parse', 'HEAD').decode().strip()
 if commit != ref['sdk_source_commit'] or ref.get('sdk_source_state',{}).get('kind','commit') != 'commit': raise SystemExit('Mobile source must match the clean documentation SDK commit')
 if git('status','--porcelain','--untracked-files=all','--',*paths).strip(): raise SystemExit('Mobile inputs must be clean; do not absorb workspace edits')
 files = [x for x in git('ls-files','--',*paths).decode().splitlines() if x.endswith(('.java','.swift','.md','.json','.kts','.pro','.xml'))]
 blobs = {n:git('show',f'{commit}:{n}') for n in files}
 source_kind = 'same-commit clean Git source'
methods = json.loads(blobs['wuying-sdk-go/mobile/api.json'])['methods']
constants = {}
for platform, name, pattern in [
 ('android','wuying-sdk-android/sdk/src/main/java/com/aliyun/wuying/sdk/Methods.java',r'public static final String (\w+) = "([^"]+)";'),
 ('ios','wuying-sdk-ios/Sources/WuyingSDK/Methods.swift',r'public static let (\w+) = "([^"]+)"')]:
 pairs = re.findall(pattern, blobs[name].decode())
 if len(pairs)!=len(methods) or len(dict(pairs))!=len(pairs) or len({v for _,v in pairs})!=len(pairs): raise SystemExit('Duplicate or missing native method constants')
 constants[platform]={v:k for k,v in pairs}
 if set(constants[platform])!={m['name'] for m in methods}: raise SystemExit('Native constants differ from Go mobile contract')
for m in methods:
 m['constants']={platform:table[m['name']] for platform,table in constants.items()}
snapshot={'schema_version':1,'sdk_source_commit':commit,'source_kind':source_kind,'source_archive_sha256':ref['source_archive_sha256'],'sdk_source_state':ref.get('sdk_source_state'),'source_sha256':{n:hashlib.sha256(v).hexdigest() for n,v in sorted(blobs.items())},'methods':methods}
target=project/'scripts/public-api-inputs/mobile.json'
if target.is_symlink() or target.parent.is_symlink(): raise SystemExit('Symlink output rejected')
target.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'methods':len(methods),'platforms':list(constants),'commit':commit,'source_files':len(blobs)}))
