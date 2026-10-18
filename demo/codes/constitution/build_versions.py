#!/usr/bin/env python3
"""Reconstruct the six Constitution snapshots from the seven project PDFs.

Run from any working directory with Python and pdfplumber installed. This script
does not fetch or modify source material. It fails when quoted amendment text
does not match the preceding snapshot, except explicitly recorded source
discrepancies. Paragraphs are recovered from the PDFs' visible indentation.
"""
from __future__ import annotations

import copy
import difflib
import hashlib
import json
import re
from pathlib import Path

import pdfplumber

PROJECT = Path(__file__).resolve().parents[3]
# The source PDFs are kept in 教学资料; older layouts stored them in the project root.
ROOT = next((p for p in (PROJECT / "教学资料", PROJECT) if (p / "中华人民共和国宪法(1982年).pdf").is_file()), PROJECT)
OUT = Path(__file__).resolve().parent / "versions.json"
YEARS = [1982, 1988, 1993, 1999, 2004, 2018]
FULL_FILES = {y: f"中华人民共和国宪法({y}年).pdf" for y in (1982, 2018)}
AMEND_FILES = {y: f"中华人民共和国宪法修正案({y}).pdf" for y in YEARS[1:]}
CN_DIGITS = "零一二三四五六七八九"
ARTICLE_RE = re.compile(r"^(第([零一二三四五六七八九十百]+)条)(.*)$")
HEADING_RE = re.compile(r"^第[一二三四五六七八九十]+[章节]")
SOURCE_DISCREPANCIES = [
    {
        "unitId": "a10", "year": 1988,
        "file": AMEND_FILES[1988], "page": 1,
        "sourceText": "任何组织或个人不得侵占、买卖或者以其他形式非法转让土地。",
        "displayText": "任何组织或者个人不得侵占、买卖或者以其他形式非法转让土地。",
        "checkedAgainst": [{"file": FULL_FILES[1982], "page": 5}, {"file": FULL_FILES[2018], "page": 6}],
        "explanation": "1988年修正案附件写作‘任何组织或个人’，已目视核对PDF页面。按1982及2018全文一致的‘任何组织或者个人’核校各年整合文本；修正案原文单独保留。此处附件文字差异不计为后续修宪。",
    },
    {
        "unitId": "a67", "year": 2018,
        "file": FULL_FILES[1982], "page": 15,
        "sourceText": "（二十一）全国人民代表大会授予的其他职权；",
        "displayText": "（二十二）全国人民代表大会授予的其他职权。",
        "checkedAgainst": [{"file": FULL_FILES[2018], "page": 16}],
        "explanation": "1982年全文附件第六十七条末项以分号结尾，2018年全文附件以句号结尾，均已目视核对。1982至2004年整合文本保留分号，2018年全文保留句号。来源标点差异，非修正案规定的修改；末项序号的顺延依2018年修正案第四十四条。",
    },
]


def cn_num(text):
    total = digit = 0
    for c in text:
        if c in CN_DIGITS:
            digit = CN_DIGITS.index(c)
        elif c in "十百":
            total += (digit or 1) * {"十": 10, "百": 100}[c]
            digit = 0
    return total + digit


def cn_label(n):
    if n < 10:
        return CN_DIGITS[n]
    if n < 20:
        return "十" + (CN_DIGITS[n % 10] if n % 10 else "")
    if n < 100:
        return CN_DIGITS[n // 10] + "十" + (CN_DIGITS[n % 10] if n % 10 else "")
    rest = n % 100
    return CN_DIGITS[n // 100] + "百" + (("零" + cn_label(rest)) if 0 < rest < 10 else (("一" if 10 <= rest < 20 else "") + cn_label(rest)) if rest else "")


def compact(text):
    return re.sub(r"\s+", "", text)


def get_lines(file):
    with pdfplumber.open(ROOT / file) as pdf:
        pages = len(pdf.pages)
        result = []
        for number, page in enumerate(pdf.pages, 1):
            for line in page.extract_text_lines():
                text = compact(line["text"])
                if not text or text.startswith("【法宝引证码】") or "下载日期：" in text:
                    continue
                if text.startswith("©"):
                    return result, pages
                result.append({"text": text, "x": line["x0"], "page": number})
        return result, pages


def reference(file, page, amendment=None):
    ref = {"file": file, "page": page}
    if amendment is not None:
        ref["amendmentArticle"] = f"第{cn_label(amendment)}条"
    return ref


def unique_refs(refs):
    return [dict(x) for x in dict.fromkeys(tuple(x.items()) for x in refs)]


def parse_full(year):
    file = FULL_FILES[year]
    lines, _ = get_lines(file)
    active = False
    current = None
    result = {}
    pcount = 0
    for line in lines:
        text, x, page = line["text"], line["x"], line["page"]
        if text.startswith("中国是世界上历史最悠久的国家之一"):
            active = True
        if not active or HEADING_RE.match(text):
            continue
        m = ARTICLE_RE.match(text)
        if m:
            number = cn_num(m[2])
            stable = number + 5 if year == 1982 and number >= 123 else number
            current = f"a{stable}"
            assert current not in result, (year, current)
            result[current] = {"label": m[1], "paragraphs": [m[3]], "sourceRefs": [reference(file, page)]}
            continue
        if current is None or current.startswith("p"):
            if x > 70:
                pcount += 1
                current = f"p{pcount}"
                result[current] = {"label": f"序言第{cn_label(pcount)}自然段", "paragraphs": [text], "sourceRefs": [reference(file, page)]}
            else:
                assert current, (year, line)
                result[current]["paragraphs"][-1] += text
                result[current]["sourceRefs"].append(reference(file, page))
        else:
            if x > 70:
                result[current]["paragraphs"].append(text)
            else:
                result[current]["paragraphs"][-1] += text
            result[current]["sourceRefs"].append(reference(file, page))
    assert pcount == 13, (year, pcount)
    assert len(result) == (151 if year == 1982 else 156), (year, len(result))
    for entry in result.values():
        entry["sourceRefs"] = unique_refs(entry["sourceRefs"])
        assert all(entry["paragraphs"]), (year, entry)
    return result


def parse_amendments(year):
    file = AMEND_FILES[year]
    lines, _ = get_lines(file)
    result = {}
    current = None
    for line in lines:
        m = ARTICLE_RE.match(line["text"])
        if m and cn_num(m[2]) <= 52:
            current = cn_num(m[2])
            assert current not in result
            result[current] = {"year": year, "number": current, "label": m[1], "text": m[3], "sourceRefs": [reference(file, line["page"], current)]}
        elif current is not None:
            result[current]["text"] += line["text"]
            result[current]["sourceRefs"].append(reference(file, line["page"], current))
    for entry in result.values():
        entry["sourceRefs"] = unique_refs(entry["sourceRefs"])
    return result


def quotes(amendment):
    # Single quotes inside an amendment's outer quotation are rendered as the
    # normal double quotation marks in the consolidated Constitution text.
    return [q.replace("‘", "“").replace("’", "”") for q in re.findall(r"“([^”]*)”", amendment["text"])]


def chapter(id):
    if id.startswith("p"):
        return "preamble"
    n = int(id[1:])
    return "general" if n <= 32 else "rights" if n <= 56 else "state" if n <= 140 else "symbols"


def diff(before, after):
    result = []
    for tag, i, j, k, l in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
        if tag == "equal":
            result.append({"type": "equal", "text": after[k:l]})
        else:
            if tag in ("delete", "replace"):
                result.append({"type": "delete", "text": before[i:j]})
            if tag in ("insert", "replace"):
                result.append({"type": "insert", "text": after[k:l]})
    return result


def build():
    first, last = parse_full(1982), parse_full(2018)
    amendments = {n: a for year in YEARS[1:] for n, a in parse_amendments(year).items()}
    assert sorted(amendments) == list(range(1, 53)), sorted(amendments)
    state = copy.deepcopy(first)
    snapshots = {1982: copy.deepcopy(state)}
    touched = {year: set() for year in YEARS}
    applied = []
    basis = {}

    def record(id, n):
        state[id]["sourceRefs"] = unique_refs(state[id]["sourceRefs"] + amendments[n]["sourceRefs"])
        touched[amendments[n]["year"]].add(id)
        numbers = basis.setdefault((id, amendments[n]["year"]), [])
        if n not in numbers:
            numbers.append(n)
        applied.append({"amendment": n, "unit": id})

    def replace(id, n, old, new):
        ps = state[id]["paragraphs"]
        matches = [i for i, p in enumerate(ps) if old in p]
        assert len(matches) == 1, (n, id, old, ps)
        i = matches[0]
        assert ps[i].count(old) == 1
        ps[i] = ps[i].replace(old, new)
        record(id, n)

    def all_paras(id, n, old, new):
        assert "".join(state[id]["paragraphs"]) == "".join(old), (n, id, state[id]["paragraphs"], old)
        state[id]["paragraphs"] = new[:]
        record(id, n)

    def add_para(id, n, text, index=None):
        ps = state[id]["paragraphs"]
        ps.insert(len(ps) if index is None else index, text)
        record(id, n)

    def add_item(id, n, position, new):
        ps = state[id]["paragraphs"]
        for i in range(len(ps)):
            match = re.match(r"^（([一二三四五六七八九十]+)）", ps[i])
            if match and cn_num(match[1]) >= position:
                ps[i] = f"（{cn_label(cn_num(match[1]) + 1)}）" + ps[i][len(match[0]):]
        where = next(i for i, p in enumerate(ps) if p.startswith(f"（{cn_label(position + 1)}）"))
        ps.insert(where, new + "；")
        record(id, n)

    for year in YEARS[1:]:
        for n, amendment in amendments.items():
            if amendment["year"] != year:
                continue
            q = quotes(amendment)
            if n == 1:
                add_para("a11", n, q[0])
            elif n == 2:
                assert q[1].startswith("任何组织或个人")
                # Source spelling discrepancy; preserve the amendment itself
                # and reconcile consolidated snapshots against both full texts.
                replace("a10", n, q[0], q[1].replace("任何组织或个人", "任何组织或者个人", 1))
            elif n == 3:
                replace("p7", n, q[0], q[1])
            elif n == 4:
                state["p10"]["paragraphs"][0] += q[0]
                record("p10", n)
            elif n in (5, 11, 12, 17, 27, 28, 30):
                id = {5: "a7", 11: "a98", 12: "p7", 17: "a28", 27: "a80", 28: "a81", 30: "a98"}[n]
                all_paras(id, n, q[:1], q[1:])
            elif n in (6, 10, 15, 19, 20, 21, 25, 26, 29, 34, 37, 38, 43, 45, 48, 49, 51):
                id = {6: "a8", 10: "a42", 15: "a8", 19: "p10", 20: "a10", 21: "a11", 25: "a59", 26: "a67", 29: "a89", 34: "p11", 37: "a3", 38: "a4", 43: "a65", 45: "a79", 48: "a101", 49: "a103", 51: "a107"}[n]
                replace(id, n, q[0], q[1])
            elif n in (7, 8, 9, 14, 16, 22):
                id, count = {7: ("a15", 2), 8: ("a16", 2), 9: ("a17", 2), 14: ("a6", 2), 16: ("a11", 3), 22: ("a13", 2)}[n]
                all_paras(id, n, q[:count], q[count:])
            elif n in (13, 23, 24, 40, 47):
                id, pos = {13: ("a5", 0), 23: ("a14", None), 24: ("a33", 2), 40: ("a27", None), 47: ("a100", None)}[n]
                add_para(id, n, q[0], pos)
            elif n == 18:
                # The amendment quotes the complete resulting preamble paragraph.
                for old, new in [(q[0], q[1]), (q[2], q[3])]:
                    replace("p7", n, old, new)
                replace("p7", n, q[4], q[4] + "，" + q[5])
                assert state["p7"]["paragraphs"] == [q[6]]
            elif n == 31:
                add_para("a141", n, q[2])
            elif n == 32:
                for old, new in [(q[0], q[1]), (q[2], q[3]), (q[6], q[7])]:
                    replace("p7", n, old, new)
                replace("p7", n, q[4], q[5] + "，" + q[4])
                assert state["p7"]["paragraphs"] == [q[8]]
            elif n == 33:
                replace("p10", n, q[0], q[1])
                replace("p10", n, q[2], q[3])
                assert state["p10"]["paragraphs"] == [q[4]]
            elif n == 35:
                replace("p12", n, q[0], q[1])
                replace("p12", n, q[2], q[2] + "，" + q[3])
                replace("p12", n, q[4], q[5])
                assert state["p12"]["paragraphs"] == [q[6]]
            elif n == 36:
                replace("a1", n, q[0], q[0] + q[1])
            elif n == 39:
                replace("a24", n, q[0], q[1])
                assert state["a24"]["paragraphs"][1] == q[2]
            elif n == 41:
                add_item("a62", n, 7, q[1])
            elif n == 42:
                add_item("a63", n, 4, q[1])
            elif n == 44:
                replace("a67", n, q[1], q[2])
                add_item("a67", n, 11, q[3])
                replace("a70", n, q[4], q[5])
            elif n == 46:
                replace("a89", n, q[1], q[2])
                replace("a89", n, q[3], q[4])
            elif n == 50:
                replace("a104", n, q[0], q[1])
                assert state["a104"]["paragraphs"] == [q[2]]
            elif n == 52:
                # New articles are explicitly quoted in amendment 52. Verify
                # them against the complete 2018 source before adding them.
                text = amendment["text"].split("内容如下：", 1)[1]
                for number in range(123, 128):
                    needle = f"第{cn_label(number)}条"
                    start = text.index(needle) + len(needle)
                    end = text.index(f"第{cn_label(number + 1)}条", start) if number < 127 else text.index("第七节相应", start)
                    assert text[start:end] == "".join(last[f"a{number}"]["paragraphs"]), number
                    state[f"a{number}"] = {"label": needle, "paragraphs": last[f"a{number}"]["paragraphs"][:], "sourceRefs": amendment["sourceRefs"][:]}
                    record(f"a{number}", n)
                for number in range(128, 144):
                    state[f"a{number}"]["label"] = f"第{cn_label(number)}条"
                    record(f"a{number}", n)
            else:
                raise AssertionError(n)
        snapshots[year] = copy.deepcopy(state)

    # Compare every reconstructed 2018 unit with the supplied complete text.
    disagreements = []
    editorial_adjustments = []
    for id in last:
        a = "\n".join(state[id]["paragraphs"])
        b = "\n".join(last[id]["paragraphs"])
        if a != b:
            if id == "a67" and a[:-1] == b[:-1] and a[-1] == "；" and b[-1] == "。":
                editorial_adjustments.append({"unitId": id, "before": "；", "after": "。", "year": 2018})
                state[id]["paragraphs"] = last[id]["paragraphs"][:]
                snapshots[2018][id]["paragraphs"] = last[id]["paragraphs"][:]
            else:
                disagreements.append({"unit": id, "replayed": a, "full2018": b, "diff": diff(a, b)})
    if disagreements:
        Path("/private/tmp/fadian-versions/disagreements.json").write_text(json.dumps(disagreements, ensure_ascii=False, indent=2))
        raise AssertionError(f"2018 replay mismatch in {[x['unit'] for x in disagreements]}; see /private/tmp/fadian-versions/disagreements.json")

    units = []
    ids = [f"p{n}" for n in range(1, 14)] + [f"a{n}" for n in range(1, 144)]
    for id in ids:
        item = {"id": id, "kind": "preamble" if id.startswith("p") else "article", "number": int(id[1:]), "label": last[id]["label"], "chapter": chapter(id), "versions": {}, "editorialNotes": [x for x in SOURCE_DISCREPANCIES if x["unitId"] == id]}
        previous = None
        for year in YEARS:
            version = snapshots[year].get(id)
            exists = version is not None
            ps = version["paragraphs"] if exists else []
            label = version["label"] if exists else "尚未设立"
            text = "\n".join(ps)
            before = "\n".join(previous["paragraphs"]) if previous else ""
            refs = version["sourceRefs"] if exists else []
            if year == 2018:
                refs = unique_refs(refs + last[id]["sourceRefs"])
            differences = (([{"type": "equal", "text": text}] if text else []) if year == 1982 else diff(before, text))
            if id == "a67" and year == 2018:
                assert differences[-2:] == [{"type": "delete", "text": "；"}, {"type": "insert", "text": "。"}]
                differences[-2:] = [{"type": "editorial", "text": "。", "previousText": "；"}]
            # Every diff must reconstruct its original and target snapshot;
            # editorial marks have a separate type so they cannot imply lawmaking.
            assert "".join(x["text"] for x in differences if x["type"] != "delete") == text
            if year != 1982:
                assert "".join(x.get("previousText", x["text"]) for x in differences if x["type"] != "insert") == before
            item["versions"][str(year)] = {
                "exists": exists, "label": label, "paragraphs": ps,
                "changed": year != 1982 and (any(x["type"] in ("delete", "insert") for x in differences) or label != (previous["label"] if previous else "尚未设立")),
                "sourceRefs": refs,
                "diff": differences,
                # Amendment articles (numbered 1-52 across all amendments) that changed this unit in this year.
                "amendments": basis.get((id, year), []) if year != 1982 else [],
                "method": "PDF全文逐段提取" if year == 1982 else "PDF全文逐段提取，另以历次修正案回放并核校来源差异" if year == 2018 else "依1982年原文及截至当年的修正案逐项整合；非该年官方全本；来源文字差异另附校勘说明",
            }
            previous = version
        units.append(item)

    files = [FULL_FILES[1982], *AMEND_FILES.values(), FULL_FILES[2018]]
    sources = [{"file": f, "sha256": hashlib.sha256((ROOT / f).read_bytes()).hexdigest(), "pages": get_lines(f)[1]} for f in files]
    result = {
        "years": YEARS, "sources": sources, "units": units,
        "amendments": list(amendments.values()),
        "validation": {
            "unitCount": len(units), "preambleParagraphs": 13, "articles1982": 138, "articles2018": 143,
            "amendmentCount": 52, "allAmendmentsApplied": sorted(set(x["amendment"] for x in applied)) == list(range(1, 53)),
            "replayed2018MatchesSuppliedFullText": True,
            "matchQualification": "已明确处理两处附件来源差异后，全部156个单元与2018全文逐段逐字一致；未经校勘的原始回放含两处差异，详见sourceDiscrepancies。",
            "method": "按PDF可见缩进恢复段落；逐项匹配旧文字后执行修正；最终与2018全文的156个单元逐段逐字比对。排版空白被移除，修正案引号嵌套恢复为全文引号。",
            "sourceDiscrepancies": SOURCE_DISCREPANCIES,
            "renumbering": "2018新增第一百二十三至一百二十七条，原第一百二十三至一百三十八条顺延为第一百二十八至一百四十三条。",
            "changedUnits": {str(y): sorted(touched[y]) for y in YEARS[1:]},
        },
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["validation"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
