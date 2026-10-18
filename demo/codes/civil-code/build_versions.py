#!/usr/bin/env python3
"""Build the Civil Code from the official NPC database DOCX, downloaded 2026-10-18.

Source: https://flk.npc.gov.cn/detail?id=ff808081729d1efe01729d50b5c500bf
SHA-256: 6926a597a66c5aad4803591ce9a51a8eebe847260f5ba2805210b608ded78353
Usage: python3 build_versions.py --source /path/to/civil-2020.docx
Original downloads remain outside the repository. No network or AI is used here.
"""
import argparse
import json
from pathlib import Path
from docx_source import parse_law, version

PACK = Path(__file__).resolve().parent
SOURCE = {'file': 'civil-2020.docx', 'title': '中华人民共和国民法典（2020）',
          'publisher': '国家法律法规数据库', 'downloaded': '2026-10-18',
          'url': 'https://flk.npc.gov.cn/detail?id=ff808081729d1efe01729d50b5c500bf',
          'downloadUrl': 'https://flk.npc.gov.cn/law-search/download/mobile?format=docx&bbbs=ff808081729d1efe01729d50b5c500bf&fileId=',
          'sha256': '6926a597a66c5aad4803591ce9a51a8eebe847260f5ba2805210b608ded78353',
          'adopted': '2020-05-28', 'effective': '2021-01-01'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--out-dir', type=Path, default=PACK)
    args = parser.parse_args()
    articles, structure, validation = parse_law(args.source, SOURCE, 1260, 'a')
    expected = [(1, 204), (205, 462), (463, 988), (989, 1039), (1040, 1118), (1119, 1163), (1164, 1258), (1259, 1260)]
    if [(int(n['from'][1:]), int(n['to'][1:])) for n in structure] != expected:
        raise ValueError('各编范围与核对表不一致')
    units = [{'id': f'a{n}', 'kind': 'article', 'number': n, 'label': a['label'],
              'versions': {'2020': version(a, SOURCE)}} for n, a in articles.items()]
    data = {'years': [2020], 'sources': [SOURCE], 'units': units, 'amendments': [],
            'validation': {**validation, 'sourceHashesVerified': True, 'articleNumbersContinuous': True}}
    codex = json.loads((PACK / 'codex.json').read_text(encoding='utf-8'))
    codex['structure'] = structure
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for file, value in [('versions.json', data), ('codex.json', codex)]:
        (args.out_dir / file).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"民法典：1260 条，{validation['paragraphCount']} 段，{validation['headingCount']} 个目录节点；目录与正文一致。")


if __name__ == '__main__':
    main()
