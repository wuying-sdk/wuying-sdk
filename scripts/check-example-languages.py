#!/usr/bin/env python3
"""Validate six-entry task cards and explicitly classified language reference blocks."""
import argparse,hashlib,json,re
from pathlib import Path

def fences(text):
    result=[];current=None;offset=0
    for line in text.splitlines(keepends=True):
        stripped=line.rstrip('\r\n')
        if current:
            char,size,info,start,body=current
            if re.fullmatch(r' {0,3}'+re.escape(char)+'{'+str(size)+r',}[ \t]*',stripped):
                parts=info.strip().split(maxsplit=1)
                result.append({'start':start,'end':offset+len(line),'syntax':parts[0] if parts else '', 'title':parts[1] if len(parts)>1 else '', 'code':''.join(body).rstrip('\r\n'),'raw':text[start:offset+len(line)].rstrip('\r\n')});current=None
            else:body.append(line)
        else:
            match=re.fullmatch(r' {0,3}(`{3,}|~{3,})(.*)',stripped)
            if match:current=(match[1][0],len(match[1]),match[2],offset,[])
        offset+=len(line)
    if current:raise ValueError('Unclosed code fence')
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--docs-root',type=Path);p.add_argument('--write',action='store_true');args=p.parse_args()
    project=Path(__file__).resolve().parents[1];docs=args.docs_root or project/'docs';policy=json.loads((project/'scripts/example-language-policy.json').read_text())
    allowed={(x['path'],x['sha256']):x['reason'] for x in policy['specific_blocks']};references={x['path']:x for x in policy['language_reference_pages']}
    generated=json.loads((project/'api-operation-manifest.json').read_text())['generated_sha256']
    expected=['TypeScript','Go','Java','Android','iOS','CLI'];groups=[];specific=[];reference_report=[];seen=set();seen_refs=set()
    for path in sorted(docs.rglob('*.mdx')):
        rel=path.relative_to(docs).as_posix();text=path.read_text()
        if rel.startswith(('reference/','api-reference/')):
            if rel in generated:
                reference_report.append({'path':rel,'purpose':'按同版本真实语言签名、类型、接口结构及授权生成；由 API 覆盖检查核验。'})
            elif rel in references:
                item=references[rel];seen_refs.add(rel)
                if hashlib.sha256(text.encode()).hexdigest()!=item['sha256']:raise SystemExit(f'{rel}: language-reference classification stale')
                reference_report.append({'path':rel,'purpose':item['reason'],'fences':len(fences(text))})
            else:raise SystemExit(f'{rel}: unclassified reference page')
            continue
        ranges=[]
        for index,m in enumerate(re.finditer(r'<CodeGroup>.*?</CodeGroup>',text,re.S)):
            blocks=fences(m[0]);titles=[b['title'] for b in blocks]
            if titles!=expected:raise SystemExit(f'{rel} group {index+1}: expected {expected}, found {titles}')
            if any(not b['code'].strip() for b in blocks):raise SystemExit(f'{rel}: empty language card')
            groups.append({'path':rel,'group':index+1,'languages':titles,'support_notes':[b['title'] for b in blocks if b['syntax']=='text']});ranges.append((m.start(),m.end()))
        for block in fences(text):
            if any(a<=block['start']<b for a,b in ranges):continue
            key=(rel,hashlib.sha256(block['raw'].encode()).hexdigest())
            if key not in allowed:raise SystemExit(f'{rel}: unclassified single-language block')
            seen.add(key);specific.append({'path':rel,'sha256':key[1],'reason':allowed[key]})
    if not args.docs_root and (set(allowed)!=seen or set(references)!=seen_refs):raise SystemExit('Stale specific-purpose classification entries')
    report={'common_code_groups':len(groups),'language_entries':6*len(groups),'groups':groups,'specific_blocks':specific,'language_references':reference_report,'scope':'通用任务卡片六入口。原始语言参考含同语言业务示例，明确分类保留原文；并非全部只有签名。'}
    output=project/'example-language-coverage.json';rendered=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if args.write:output.write_text(rendered)
    elif not args.docs_root and (not output.exists() or output.read_text()!=rendered):raise SystemExit('Example coverage report stale; run checker --write')
    print(f'PASS: {len(groups)} task groups, {len(groups)*6} entries; {len(specific)} specific blocks; {len(reference_report)} generated/classified reference pages')
if __name__=='__main__':main()
