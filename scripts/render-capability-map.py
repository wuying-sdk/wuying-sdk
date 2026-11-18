#!/usr/bin/env python3
"""Render the capability overview's responsive, theme-specific SVG illustrations.

Presentation only: API support remains owned by the linked domain/reference pages.
Run with Python's standard library; no font, network or rendering dependency.
"""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets'
CARDS = [
    ('云资源', '管理与控制', 'monitor', [
        ('Runtime', '云桌面创建、启停与管理'),
        ('ASP 流化', '桌面与应用画面接入'),
        ('远程脚本', '执行系统命令、启动应用'),
        ('端口服务', '访问资源内已配置的服务'),
    ]),
    ('AI 能力', '任务与交互', 'spark', [
        ('Agent', '发现与调用智能体'),
        ('Conversation', '会话、消息与任务执行'),
        ('Skill', '技能查询、安装与管理'),
        ('Model', '模型目录与会话模型选择'),
    ]),
    ('存储能力', '文件与知识', 'storage', [
        ('WyDrive', '云盘空间与文件查询'),
        ('KnowledgeSpace', '知识空间与知识文件查询'),
    ]),
    ('计量', '套餐与用量', 'meter', [
        ('Credit', '套餐、用量与明细查询'),
    ]),
]
ICONS = {
    'monitor': '<rect x="2" y="3" width="24" height="17" rx="3"/><path d="M9 26h10M14 20v6"/>',
    'spark': '<path d="m14 1 3.6 9.4L27 14l-9.4 3.6L14 27l-3.6-9.4L1 14l9.4-3.6Z"/>',
    'storage': '<ellipse cx="14" cy="6" rx="11" ry="4"/><path d="M3 6v16c0 5 22 5 22 0V6M3 14c0 5 22 5 22 0"/>',
    'meter': '<path d="M3 24V14h5v10M12 24V4h5v20M21 24V9h5v15"/>',
}


def render(mobile=False, dark=False):
    w = 520 if mobile else 1000
    colors = {'bg': '#111318', 'card': '#191C22', 'line': '#343942', 'ink': '#F5F5F4', 'muted': '#B4BBC5', 'accent': '#FB923C', 'tint': '#352319'} if dark else {'bg': '#FFFFFF', 'card': '#FFFFFF', 'line': '#E4E7EC', 'ink': '#20252E', 'muted': '#667085', 'accent': '#EA580C', 'tint': '#FFF2E9'}
    blocks = []

    def rect(x, y, width, height, fill, stroke=None, radius=18):
        blocks.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}"' + (f' stroke="{stroke}" stroke-width="1.5"' if stroke else '') + '/>')

    def text(x, y, value, size=20, weight=400, color=None, anchor=None):
        blocks.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color or colors["ink"]}"' + (f' text-anchor="{anchor}"' if anchor else '') + f'>{escape(value)}</text>')

    margin = 16 if mobile else 24
    rect(margin, 16, w - margin * 2, 136, colors['tint'], colors['accent'])
    text(w / 2, 59, 'Wuying SDK · Client', 30, 700, anchor='middle')
    text(w / 2, 92, '无影对外集成能力的统一入口', 21, 500, anchor='middle')
    text(w / 2, 126, '认证与授权  ·  生命周期  ·  能力入口', 18, color=colors['muted'], anchor='middle')

    def card(index, x, y, width):
        title, subtitle, icon, rows = CARDS[index]
        height = 82 + 64 * len(rows) + 12
        rect(x, y, width, height, colors['card'], colors['line'])
        rect(x + 18, y + 18, 46, 46, colors['tint'], radius=12)
        blocks.append(f'<g transform="translate({x + 27} {y + 27})" fill="none" stroke="{colors["accent"]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[icon]}</g>')
        text(x + 78, y + 41, title, 26, 700)
        text(x + width - 20, y + 41, subtitle, 17, color=colors['muted'], anchor='end')
        for i, (label, description) in enumerate(rows):
            row = y + 99 + i * 64
            text(x + 24, row, label, 22, 650)
            text(x + 24, row + 27, description, 19, color=colors['muted'])
        return height

    if mobile:
        blocks.append(f'<path d="M260 152v32" fill="none" stroke="{colors["accent"]}" stroke-width="2"/>')
        y = 184
        for i in range(4):
            y += card(i, 16, y, 488) + 18
        h = y + 105
        text(w / 2, y + 21, '按当前身份授权访问', 20, 600, anchor='middle')
        text(w / 2, y + 53, '不同能力的认证、平台支持与接口范围', 18, color=colors['muted'], anchor='middle')
        text(w / 2, y + 79, '以对应模型页和 API Reference 为准', 18, color=colors['muted'], anchor='middle')
    else:
        blocks.append(f'<path d="M500 152v30" fill="none" stroke="{colors["accent"]}" stroke-width="2"/>')
        rect(8, 182, 984, 668, colors['bg'], colors['line'], radius=24)
        text(32, 217, '四类集成能力', 18, 600, color=colors['muted'])
        card(0, 24, 236, 466)
        card(1, 510, 236, 466)
        # The lower cards are peer capabilities; no directional arrows imply call order.
        card(2, 24, 606, 466)
        card(3, 510, 606, 466)
        h = 916
        text(w / 2, 890, '按当前身份授权访问；认证方式、平台支持与接口范围以对应模型页为准。', 19, color=colors['muted'], anchor='middle')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc">
<title id="title">无影 SDK 能力地图</title>
<desc id="desc">Client 是统一集成入口。四类能力为：云资源（Runtime、ASP 流化、远程脚本、端口服务）；AI 能力（Agent、Conversation、Skill、Model）；存储能力（WyDrive、KnowledgeSpace）；计量（Credit）。各能力的认证与平台支持以模型页为准。</desc>
<rect width="{w}" height="{h}" fill="{colors['bg']}"/>
<g font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif">{''.join(blocks)}</g>
</svg>
'''
    return svg


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for mobile in [False, True]:
        for dark in [False, True]:
            name = 'capability-map' + ('-mobile' if mobile else '') + ('-dark' if dark else '-light') + '.svg'
            (OUT / name).write_text(render(mobile, dark))
            print(name)
