"""استخراج الجدول العام للمعلمين (تصدير aSc Timetables بصيغة PDF) إلى data.js

الاستخدام:
    python3 tools/extract_timetable.py الجدول.pdf data.js

يحتاج: pip install pdfplumber
"""
import collections
import json
import re
import sys
import unicodedata

import pdfplumber

# حدود شبكة الحصص في تصدير aSc (أفقي، letter)
X0, X1 = 39.8, 703.0
COLS = 40  # 5 أيام × (7 حصص + الفسحة)
W = (X1 - X0) / COLS
SLOTS = ['1', '2', '3', 'B', '4', '5', '6', '7']  # من اليمين: الأولى، الثانية، الثالثة، الفسحة، ...

CODE_RE = re.compile(r'\d[؀-ۿ]\d')

# الأقسام حسب المادة
DEPTS = [
    ('التربية الإسلامية', ['دين', 'تلاوة']),
    ('اللغة العربية', ['عربي', 'قراءة', 'تعزيز (عربي)']),
    ('اللغة الإنجليزية', ['إنجليزي', 'Reading']),
    ('الرياضيات', ['رياضيات']),
    ('العلوم', ['علوم']),
    ('المواد الاجتماعية', ['اجتماعيات', 'مواطنة']),
    ('التربية الرياضية', ['رياضة']),
    ('اللغة الفرنسية', ['فرنسي', 'تعزيز (فرنسي)']),
    ('التصميم والتقانة', ['أسرية/حاسوب', 'تقانة/موسيقى', 'معادن/موسيقى', 'فنية/معادن', 'فنية/موسيقى']),
]
NON_TEACHING = {'مراقبة', 'اجتماع القسم', 'اجتماع التحسين', 'مشرف متابع'}


def fix(s):
    """يقلب النص العربي المعكوس في التصدير ويطبّع الحروف."""
    s = s.strip()
    if re.search(r'[؀-ۿﭐ-﻿]', s) and not CODE_RE.fullmatch(unicodedata.normalize('NFKC', s)):
        s = s[::-1]
        s = s.replace('(', '\0').replace(')', '(').replace('\0', ')')
    s = unicodedata.normalize('NFKC', s)
    return re.sub(r'\s+', ' ', s).strip()


def clean_label(t):
    t = t.replace('التحس ين', 'التحسين')
    t = re.sub(r'^/(\S+) (\S+)$', r'\1/\2', t)  # "/معادن موسيقى" -> "معادن/موسيقى"
    return t


def lines_of(chars):
    rows = {}
    for c in chars:
        rows.setdefault(round(c['top']), []).append(c)
    out = []
    for k in sorted(rows):
        row = sorted(rows[k], key=lambda c: c['x0'])
        groups = [[row[0]]]
        for c in row[1:]:
            if c['x0'] - groups[-1][-1]['x1'] > 3:
                groups.append([c])
            else:
                groups[-1].append(c)
        out.append([''.join(c['text'] for c in g) for g in groups])
    return out


def extract(path):
    teachers = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            vlines = [l for l in page.lines if abs(l['x0'] - l['x1']) < 0.5]
            ys = sorted({round(l['top'], 1) for l in page.lines if abs(l['top'] - l['bottom']) < 0.5})
            ys = [y for y in ys if y >= 113]
            for top, bot in zip(ys, ys[1:]):
                mid = (top + bot) / 2
                # الخلايا المدموجة (حصتين) ما بينها خط عمودي
                bounds = {0, COLS}
                for l in vlines:
                    if l['top'] - 1 <= mid <= l['bottom'] + 1:
                        k = round((X1 - l['x0']) / W)
                        if abs((X1 - k * W) - l['x0']) < 1.2:
                            bounds.add(k)
                bounds = sorted(bounds)
                spans = list(zip(bounds, bounds[1:]))
                name, total, cells_chars = [], [], collections.defaultdict(list)
                for c in page.chars:
                    cy, cx = (c['top'] + c['bottom']) / 2, (c['x0'] + c['x1']) / 2
                    if not top < cy < bot:
                        continue
                    if cx > X1:
                        name.append(c)
                    elif cx < X0:
                        total.append(c)
                    else:
                        k = (X1 - cx) / W
                        for sp in spans:
                            if sp[0] <= k < sp[1]:
                                cells_chars[sp].append(c)
                                break
                cells = {}
                for sp, chars in cells_chars.items():
                    parts = [fix(s) for segs in lines_of(chars) for s in segs]
                    codes = [x for x in parts if CODE_RE.fullmatch(x)]
                    label = clean_label(' '.join(x for x in parts if x not in codes))
                    for k in range(sp[0], sp[1]):
                        cell = {'c': ' / '.join(codes), 't': label}
                        if sp[1] - sp[0] > 1:
                            cell['span'] = sp[1] - sp[0]
                        cells[f'{k // 8}-{SLOTS[k % 8]}'] = cell
                nm = re.sub(r'\s+', ' ', ' '.join(fix(' '.join(segs)) for segs in lines_of(name)))
                nm = re.sub(r'^أ\.\s*', 'أ. ', nm)
                tot = ''.join(fix(c['text']) for c in sorted(total, key=lambda c: c['x0']))
                teachers.append({'name': nm, 'total': int(tot or 0), 'cells': cells})
    for i, t in enumerate(teachers):
        t['id'] = f't{i + 1}'
        subj = collections.Counter(c['t'] for c in t['cells'].values() if c['t'] not in NON_TEACHING)
        t['dept'] = 'أخرى'
        if subj:
            top = subj.most_common(1)[0][0]
            for dept, subjects in DEPTS:
                if top in subjects:
                    t['dept'] = dept
        t['days'] = sorted({int(k.split('-')[0]) for k in t['cells']})
        if len(t['cells']) != t['total']:
            print('تنبيه: عدد الخانات لا يطابق المجموع', t['name'], t['total'], len(t['cells']), file=sys.stderr)
    return teachers


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    data = extract(src)
    order = ['id', 'name', 'dept', 'total', 'days', 'cells']
    data = [{k: t[k] for k in order} for t in data]
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('// مولّد تلقائيًا من الجدول العام للمعلمين — tools/extract_timetable.py\n')
        f.write('window.TIMETABLE = ')
        json.dump({'source': 'الجدول العام للمعلمين — يطبق من 4-10-2026م', 'teachers': data}, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    for t in data:
        print(t['id'], t['dept'], t['total'], t['days'], t['name'])
