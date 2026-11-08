# يبني دليل الإدارة ودليل المعلمين (HTML) ثم يحوّلهما PDF عبر render.js
import json, os, sys
SP = '/tmp/claude-0/-home-user/70799385-46c3-5092-952d-6fb030458471/scratchpad'
APP = '/home/user/ap-taameen'
G = SP + '/guide/'
OUT = SP + '/guides/'
cfg = json.load(open(OUT + 'names.json', encoding='utf-8'))

FONTS = f"""
@font-face{{font-family:Readex;src:url(file://{APP}/assets/fonts/readex-pro-arabic-400-normal.woff2);font-weight:400}}
@font-face{{font-family:Readex;src:url(file://{APP}/assets/fonts/readex-pro-arabic-600-normal.woff2);font-weight:600}}
@font-face{{font-family:Readex;src:url(file://{APP}/assets/fonts/readex-pro-arabic-700-normal.woff2);font-weight:700}}
@font-face{{font-family:Readex;src:url(file://{APP}/assets/fonts/readex-pro-latin-400-normal.woff2);font-weight:400;unicode-range:U+0000-00FF}}
@font-face{{font-family:Readex;src:url(file://{APP}/assets/fonts/readex-pro-latin-700-normal.woff2);font-weight:700;unicode-range:U+0000-00FF}}
@font-face{{font-family:Amiri;src:url(file://{APP}/assets/fonts/amiri-arabic-700-normal.woff2);font-weight:700}}
"""
CSS = FONTS + """
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:Readex,sans-serif;color:#2a1a14;background:#fbf7ef;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;padding:16mm 15mm 18mm;background:#fbf7ef}
.page:last-child{page-break-after:auto}
.page::before{content:"";position:absolute;inset:7mm;border:1px solid rgba(184,134,43,.45);border-radius:6mm;pointer-events:none}
.top{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #b8862b;padding-bottom:3mm;margin-bottom:6mm}
.top img{height:13mm}
.top .t{font-size:9pt;color:#7a0a16;font-weight:600}
.foot{position:absolute;bottom:10mm;left:15mm;right:15mm;display:flex;justify-content:space-between;font-size:8pt;color:#8a7560}
h1{font-family:Amiri;font-size:30pt;color:#7a0a16;line-height:1.3}
h2{font-family:Amiri;font-size:21pt;color:#7a0a16;margin-bottom:4mm;display:flex;align-items:center;gap:3mm}
h2 .n{font-family:Readex;font-size:12pt;width:9mm;height:9mm;border-radius:50%;background:#7a0a16;color:#f6d690;display:inline-grid;place-items:center}
h3{font-size:12pt;color:#4d0610;margin:4mm 0 2mm}
p,li{font-size:10.5pt;line-height:1.85}
ul,ol{padding-inline-start:6mm}
li{margin-bottom:1mm}
b{color:#4d0610}
.lead{font-size:11pt;color:#4a3a30;margin-bottom:4mm}
.box{background:#fff;border:1px solid #ead9b8;border-radius:4mm;padding:4mm 5mm;margin:3mm 0}
.box.gold{background:linear-gradient(135deg,#fff8e6,#fdf0d2);border-color:#e2b45a}
.box.red{background:#fff3f1;border-color:#e9b4ad}
.box.red b{color:#a3121f}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm}
.shot{border-radius:4mm;overflow:hidden;border:1px solid #e5d3ae;box-shadow:0 2mm 5mm rgba(77,6,16,.12);background:#fff}
.shot img{display:block;width:100%}
.cap{font-size:9pt;color:#5a4a40;text-align:center;margin-top:2mm;line-height:1.6}
.cap b{display:block;font-size:10pt}
.phoneimg{border-radius:6mm;overflow:hidden;border:2.2mm solid #1b0d0b;box-shadow:0 2mm 6mm rgba(0,0,0,.25);background:#1b0d0b}
.phoneimg img{display:block;width:100%}
.tag{display:inline-block;padding:.5mm 3mm;border-radius:10mm;font-size:9pt;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
td,th{padding:2.2mm 3mm;border-bottom:1px solid #eadfc8;text-align:right;vertical-align:top;line-height:1.6}
th{background:#4d0610;color:#f6d690;font-weight:600}
.sw{display:inline-block;width:4mm;height:4mm;border-radius:1mm;vertical-align:middle;margin-inline-end:2mm}
/* الغلاف */
.cover{padding:0;background:radial-gradient(120% 80% at 50% 0%,#5a0812 0%,#2b0408 70%)}
.cover::before{border-color:rgba(226,180,90,.5)}
.cover .hdr{background:#fff;padding:5mm 12mm 4mm}
.cover .hdr img{width:100%;display:block}
.cover .in{padding:12mm 16mm;color:#f3e6cf;text-align:center}
.cover .icon{width:30mm;height:30mm;border-radius:7mm;margin:4mm auto 6mm;display:block;box-shadow:0 0 12mm rgba(246,214,144,.35)}
.cover h1{color:#f6d690;font-size:36pt}
.cover .sub{font-family:Amiri;font-size:20pt;color:#e2b45a;margin-top:1mm}
.cover .desc{font-size:11pt;line-height:1.9;margin:6mm auto 0;max-width:150mm;color:#ead9c0}
.qrwrap{display:inline-flex;gap:7mm;align-items:center;background:#fbf7ef;border-radius:6mm;padding:5mm 7mm;margin-top:8mm;color:#2a1a14;text-align:right}
.qrwrap img{width:42mm;height:42mm}
.qrwrap .l{font-size:10pt;line-height:1.8}
.qrwrap .u{direction:ltr;font-weight:700;color:#7a0a16;font-size:11pt;display:block;margin-top:1mm}
.pills{display:flex;justify-content:center;gap:3mm;margin-top:8mm;flex-wrap:wrap}
.pills span{border:1px solid rgba(226,180,90,.6);color:#f6d690;border-radius:10mm;padding:1.5mm 5mm;font-size:10pt}
/* رسوم تثبيت */
.mock{background:#f2f2f6;border:2mm solid #1b1b1f;border-radius:7mm;height:68mm;position:relative;overflow:hidden;font-family:-apple-system,Readex,sans-serif}
.mock .url{margin:5mm 4mm 0;background:#fff;border-radius:3mm;font-size:7.5pt;padding:1.6mm 3mm;direction:ltr;text-align:center;color:#333}
.mock .pg{margin:4mm;height:30mm;border-radius:3mm;background:linear-gradient(#3a0610,#1b0306);display:grid;place-items:center}
.mock .pg img{width:14mm;border-radius:3mm}
.mock .bar{position:absolute;bottom:0;left:0;right:0;height:11mm;background:#f9f9fb;border-top:1px solid #ddd;display:flex;justify-content:space-around;align-items:center;color:#0a84ff;font-size:12pt}
.hl{outline:1.2mm solid #e8730c;outline-offset:.6mm;border-radius:2mm;position:relative}
.sheet{position:absolute;bottom:0;left:0;right:0;background:#fff;border-radius:4mm 4mm 0 0;padding:3mm;box-shadow:0 -1mm 4mm rgba(0,0,0,.15)}
.sheet .row{display:flex;justify-content:space-between;align-items:center;padding:2mm 2.5mm;font-size:8pt;border-bottom:1px solid #eee;color:#111}
.sheet .row i{font-style:normal;color:#555}
.menu{position:absolute;top:4mm;left:3mm;width:40mm;background:#fff;border-radius:2.5mm;box-shadow:0 1mm 4mm rgba(0,0,0,.25);font-size:7.5pt;color:#222}
.menu div{padding:2mm 3mm;border-bottom:1px solid #f0f0f0}
.home{background:linear-gradient(160deg,#1d3557,#457b9d);display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;padding:7mm 4mm;height:100%}
.home .ap{display:flex;flex-direction:column;align-items:center;gap:1mm;font-size:6pt;color:#fff}
.home .ap span{width:10mm;height:10mm;border-radius:2.4mm;background:rgba(255,255,255,.25);display:block}
.home .ap img{width:10mm;height:10mm;border-radius:2.4mm}
.stepn{display:inline-grid;place-items:center;width:6.5mm;height:6.5mm;border-radius:50%;background:#e8730c;color:#fff;font-size:9pt;font-weight:700;margin-inline-end:1.5mm}
.mcap{font-size:9pt;text-align:center;margin-top:2mm;line-height:1.55}
/* التوقيعات */
.sign{margin-top:6mm;border-top:2px solid #b8862b;padding-top:4mm}
.sign .prep{text-align:center;font-size:10.5pt;margin-bottom:4mm}
.sign .prep b{font-family:Amiri;font-size:15pt}
.sigs{display:flex;justify-content:space-around;gap:4mm;text-align:center}
.sigs div{flex:1;font-size:9.5pt;color:#5a4a40}
.sigs b{display:block;font-family:Amiri;font-size:13.5pt;color:#4d0610;margin-top:1mm;min-height:7mm}
.crop{overflow:hidden}
"""

def name_or_line(n):
    return n if n.strip() else '<span style="display:inline-block;width:40mm;border-bottom:1px dotted #8a7560">&nbsp;</span>'

def sign_block():
    a = cfg['assistants'] or ['']
    sigs = ''.join(f'<div>المدير المساعد<b>{name_or_line(x)}</b></div>' for x in a)
    sigs += f'<div>مدير المدرسة<b>{name_or_line(cfg["principal"])}</b></div>'
    return f'''<div class="sign"><div class="prep">إعداد<br><b>{name_or_line(cfg["prepared"])}</b></div><div class="sigs">{sigs}</div></div>'''

def top(title):
    return f'<div class="top"><span class="t">{title}</span><img src="file://{APP}/assets/header.jpg"></div>'

def foot(doc, n, total):
    return f'<div class="foot"><span>تطبيق التأمين والتبديل — {doc}</span><span dir="ltr">{n} / {total}</span></div>'

def img(f):
    return f'file://{G}{f}'

def cover(sub, qr, url, desc, pills, note):
    return f'''<section class="page cover"><div class="hdr"><img src="file://{APP}/assets/header.jpg"></div>
<div class="in"><img class="icon" src="file://{APP}/app/icon-512.png"><h1>تطبيق التأمين والتبديل</h1><div class="sub">{sub}</div>
<p class="desc">{desc}</p>
<div class="qrwrap"><img src="file://{SP}/{qr}"><div class="l">{note}<span class="u">{url}</span></div></div>
<div class="pills">{''.join(f'<span>{p}</span>' for p in pills)}</div></div></section>'''

# ---------------- رسوم التثبيت ----------------
ICON = f'file://{APP}/app/icon-192.png'
def ios_steps():
    m1 = f'''<div class="mock"><div class="url">ap-taameen.web.app/app/</div><div class="pg"><img src="{ICON}"></div>
<div class="bar"><span>‹</span><span>›</span><span class="hl" style="padding:0 1.5mm">⬆︎</span><span>📖</span><span>⧉</span></div></div>
<div class="mcap"><span class="stepn">1</span>افتح الرابط في <b>Safari</b> واضغط زر <b>المشاركة</b> ⬆︎ تحت</div>'''
    m2 = f'''<div class="mock"><div class="url">ap-taameen.web.app/app/</div><div class="pg"><img src="{ICON}"></div>
<div class="sheet"><div class="row"><i>⧉</i>نسخ</div><div class="row"><i>☆</i>إضافة إلى المفضلة</div><div class="row hl"><i>⊞</i><b>إضافة إلى الشاشة الرئيسية</b></div><div class="row"><i>🖨</i>طباعة</div></div></div>
<div class="mcap"><span class="stepn">2</span>انزل واختر <b>«إضافة إلى الشاشة الرئيسية»</b> ثم <b>«إضافة»</b></div>'''
    m3 = home_mock('3', 'تطلع أيقونة <b>التأمين</b> على الشاشة، افتحها مثل أي تطبيق')
    return f'<div class="grid3">{wrap(m1)}{wrap(m2)}{wrap(m3)}</div>'

def android_steps():
    m1 = f'''<div class="mock" style="background:#fff"><div class="url" style="background:#f1f3f4">ap-taameen.web.app/app/ <span class="hl" style="float:left;padding:0 1mm">⋮</span></div><div class="pg"><img src="{ICON}"></div></div>
<div class="mcap"><span class="stepn">1</span>افتح الرابط في <b>Chrome</b> واضغط <b>⋮</b> (النقاط الثلاث)</div>'''
    m2 = f'''<div class="mock" style="background:#fff"><div class="url" style="background:#f1f3f4">ap-taameen.web.app/app/</div><div class="pg"><img src="{ICON}"></div>
<div class="menu"><div>علامة تبويب جديدة</div><div>السجل</div><div>التنزيلات</div><div class="hl"><b>تثبيت التطبيق</b></div><div>مشاركة…</div></div></div>
<div class="mcap"><span class="stepn">2</span>اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b></div>'''
    m3 = home_mock('3', 'وافق على <b>«تثبيت»</b>، وتطلع الأيقونة مع تطبيقاتك')
    return f'<div class="grid3">{wrap(m1)}{wrap(m2)}{wrap(m3)}</div>'

def home_mock(n, cap):
    aps = ''.join('<div class="ap"><span></span>&nbsp;</div>' for _ in range(5))
    return f'''<div class="mock"><div class="home">{aps}<div class="ap"><img class="hl" src="{ICON}">التأمين</div>{''.join('<div class="ap"><span></span>&nbsp;</div>' for _ in range(6))}</div></div>
<div class="mcap"><span class="stepn">{n}</span>{cap}</div>'''

def wrap(x): return f'<div>{x}</div>'

def phone(f, cap, h=None):
    st = f' style="height:{h}mm"' if h else ''
    return f'<div><div class="phoneimg crop"{st}><img src="{img(f)}"></div><div class="cap">{cap}</div></div>'

# ================= دليل المعلم =================
def teacher():
    T = 'دليل المعلم'
    pages = []
    pages.append(cover('دليل المعلم', 'qr_app.svg', 'ap-taameen.web.app/app',
        'تطبيق مدرسة ابن رشد الإعدادية للبنين لاستلام تكليفات <b style="color:#f6d690">التأمين ومراقبة الفسحة والتبديل</b> مباشرة على جوالك، والرد عليها بضغطة، بدل الورق والرسائل.',
        ['تكليفاتك أول بأول', 'استلام بضغطة', 'اعتذار رسمي موثّق', 'محادثة مع الإدارة'],
        '<b>امسح الباركود بكاميرا جوالك</b><br>أو اكتب الرابط في المتصفح:'))
    # 2 التثبيت
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">١</span>ثبّت التطبيق على جوالك</h2>
<p class="lead">التطبيق ما ينزل من المتجر؛ ينثبت من المتصفح مباشرة في أقل من دقيقة، ويفتح بعدها بملء الشاشة مثل أي تطبيق.</p>
<h3>📱 آيفون — من متصفح Safari فقط</h3>{ios_steps()}
<h3 style="margin-top:6mm">🤖 أندرويد — من متصفح Chrome</h3>{android_steps()}
<div class="box gold" style="margin-top:5mm">🔑 <b>رمز الدخول:</b> لكل معلم رمز خاص من ٦ أرقام يرسله لك <b>المدير المساعد</b>. لا تشاركه مع أحد؛ فكل ما يُرسل من التطبيق يُسجَّل باسم صاحب الرمز.</div>
{foot(T, 2, 5)}</section>''')
    # 3 الدخول والاستلام
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">٢</span>الدخول واستلام التكليف</h2>
<div class="grid3">{phone('t_login.png', '<b>أدخل رمزك</b>اكتب الأرقام الستة واضغط «دخول»، ويبقى التطبيق فاتح على اسمك.', 112)}
{phone('t_card.png', '<b>بطاقة التكليف</b>فيها اليوم والحصة والوقت والصف، وبدل مين.', 112)}
{phone('t_accept.png', '<b>تأكيد الاستلام</b>اضغط «استلمت التكليف» ثم «نعم، استلمت».', 112)}</div>
<div class="box" style="margin-top:5mm"><h3 style="margin-top:0">طريقتان للرد على أي تكليف</h3>
<ul><li><b>بالأزرار:</b> «استلمت التكليف» ✓ أو «عندي عذر رسمي» !</li>
<li><b>بالسحب:</b> اسحب البطاقة <b style="color:#1f9d55">يمين للاستلام</b>، أو <b style="color:#c62828">يسار للاعتذار بعذر رسمي</b>.</li>
<li>كل رد يطلب منك <b>تأكيد</b> قبل ما ينرسل، فما فيه ضغطة بالغلط.</li>
<li>استلامك يوصل <b>للإدارة والمشرف المتابع</b> في نفس اللحظة.</li></ul></div>
{foot(T, 3, 5)}</section>''')
    # 4 الاعتذار
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">٣</span>إذا كان عندك عذر رسمي</h2>
<div class="box red"><b>التأمين تكليف رسمي من إدارة المدرسة، والحضور فيه واجب.</b> لا يُقبل الاعتذار إلا بعذر رسمي، ويُرفع للمدير المساعد للنظر فيه، وقد يُطلب منك إيضاح.</div>
<div class="grid3" style="margin-top:4mm">{phone('t_excuse.png', '<b>اختر العذر</b>العذر إلزامي من القائمة، و«عذر آخر» يحتاج توضيح.', 112)}
{phone('t_undo.png', '<b>تراجع خلال ٨ ثوانٍ</b>غلطت؟ اضغط «تراجع» في الشريط تحت.', 112)}
{phone('t_after_excuse.png', '<b>بعد الاعتذار</b>ينتقل التكليف لزميل، وتقدر «تراجعت، سأحضر».', 112)}</div>
<table style="margin-top:5mm"><tr><th style="width:38%">الحالة</th><th>وش يصير</th></tr>
<tr><td><b>استلمت ثم طرأ عذر</b></td><td>اضغط «طرأ عذر؟» واختر العذر، وينتقل التكليف لزميل وتُبلَّغ الإدارة.</td></tr>
<tr><td><b>اعتذرت ثم قدرت تحضر</b></td><td>اضغط «تراجعت، سأحضر» ما دام الزميل ما استلم. إذا استلم، يصير طلب رجوع والقرار للإدارة.</td></tr>
<tr><td><b>«أعفتك الإدارة»</b></td><td>الإدارة أسندت التكليف لغيرك؛ ما عليك شيء، شكرًا لك.</td></tr>
<tr><td><b>«أعادت الإدارة التكليف لك»</b></td><td>العذر ما اعتُمد؛ التكليف رجع لك ولازم تستلمه.</td></tr></table>
{foot(T, 4, 5)}</section>''')
    # 5 المشرف والاستيضاح والمحادثة
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">٤</span>المتابعة والاستيضاح والمحادثة</h2>
<div style="display:grid;grid-template-columns:52mm 1fr;gap:6mm;align-items:start">
{phone('t_sup.png', '<b>صفحة المتابعة للمشرف</b>', 100)}
<div><h3 style="margin-top:0">📋 المشرف المتابع</h3><p>المعلم المشرف يدخل <b>بنفس رمزه</b>، ويطلع له تبويب <b>«المتابعة»</b>: كل تأمين في صفوف إشرافه ومن المكلّف وهل استلم أو بانتظار الاستلام.</p>
<h3>✎ الاستيضاح</h3><p>إذا طلبت الإدارة إيضاحًا (عدم حضور تأمين أو مراقبة أو رفض تبديل)، يوصلك في تبويب <b>«الاستيضاح»</b>. اكتب ردك هناك، وينحفظ موثّقًا عند الإدارة.</p>
<h3>✉ المحادثة</h3><p>تواصل مع الإدارة من تبويب <b>«المحادثة»</b> بدل الواتساب، وكل رسالة باسمك من رمزك.</p>
<h3>🔔 التنبيهات</h3><p>اضغط <b>«تفعيل التنبيهات»</b> أول مرة. يوصلك تنبيه بأي تكليف جديد أو إعفاء أو استيضاح أو رسالة. <b>افتح التطبيق كل صباح</b> لتتأكد من تكليفات يومك.</p></div></div>
<div class="box gold" style="margin-top:4mm"><b>خلاصة سريعة:</b> امسح الباركود ← ثبّت التطبيق ← ادخل برمزك ← استلم تكليفك بضغطة أو اعتذر بعذر رسمي.</div>
{sign_block()}
{foot(T, 5, 5)}</section>''')
    return pages

# ================= دليل الإدارة =================
def shot(f, h, cap='', pos='top'):
    return f'<div><div class="shot crop" style="height:{h}mm"><img src="{img(f)}" style="object-position:{pos}"></div>{f"<div class=cap>{cap}</div>" if cap else ""}</div>'

def admin():
    T = 'دليل الإدارة'
    N = 6
    pages = []
    pages.append(cover('دليل الإدارة', 'qr_admin.svg', 'ap-taameen.web.app',
        'لوحة المدير المساعد لتوزيع <b style="color:#f6d690">التأمين ومراقبة الفسحة والتبديل</b> تلقائيًا أو يدويًا، وإرسالها لجوالات المعلمين، ومتابعة ردودهم لحظة بلحظة، مع تحكم كامل للإدارة.',
        ['توزيع عادل تلقائي', 'إرسال بضغطة', 'ردود ملوّنة واضحة', 'استيضاح مطبوع', 'تحكم كامل'],
        '<b>صفحة الإدارة</b> — يُفضَّل فتحها على اللابتوب<br>والدخول برمز الإدارة الخاص:'))
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">١</span>يوم العمل في خمس خطوات</h2>
<ol>
<li><b>اختر التاريخ</b> من «تأمين اليوم»، ثم اضغط أسماء <b>الغائبين</b> (أو المستأذنين من «التبديل والاستئذان»).</li>
<li><b>التوزيع:</b> «⚡ تلقائي» يختار الأنسب لكل حصة، أو «✋ أختار بنفسي» ويطلع لك لكل حصة <b>الأول (الأنسب) والثاني والثالث والرابع</b> بضغطة، مع زر «🛡 الإدارة تؤمّن».</li>
<li><b>التبديل ومراقبة الفسحة:</b> نفس الطريقة، تلقائي أو بالاختيار مع الترتيب.</li>
<li><b>اضغط «إرسال للمعلمين»</b> مرة وحدة، وبعدها أي تعديل ينرسل تلقائي.</li>
<li><b>تابع «ردود المعلمين»</b>: الألوان تقول لك الوضع من أول نظرة (الصفحة ٤).</li></ol>
{shot('a_result.png', 128, 'جدول التأمين: لكل حصة المرشّحون مرتّبون، والمختار بالأحمر، وتحته سبب الاختيار (القسم، عدد التأمينات، حصص اليوم).')}
{foot(T, 2, N)}</section>''')
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">٢</span>قواعد التوزيع المعتمدة</h2>
<p class="lead">البرنامج يطبّق هذي القواعد تلقائيًا، وأي استثناء يطلع لك بتنبيه برتقالي قبل الإرسال.</p>
<table><tr><th style="width:30%">القاعدة</th><th>التفصيل</th></tr>
<tr><td><b>القسم أولًا</b></td><td>يُقدَّم معلم من نفس قسم الغائب، <b>إلا إذا</b> صار عنده ٤ حصص متتالية أو أكثر (مع مراقبة الفسحة)، فيُقدَّم معلم من قسم آخر.</td></tr>
<tr><td><b>تأمين واحد باليوم</b></td><td>الأصل تأمين واحد للمعلم في اليوم (التأمين والمراقبة معًا).</td></tr>
<tr><td><b>الثاني للضرورة</b></td><td>إذا ما فيه أحد متاح، يُعطى تأمين ثانٍ مع تنبيه: «⚠ للضرورة: فلان سيحضر تأمينين في هذا اليوم».</td></tr>
<tr><td><b>الثالث ممنوع</b></td><td>لا يُعطى معلم ثلاثة نهائيًا؛ إذا ما فيه أحد تنتقل إلى «🛡 الإدارة تؤمّن».</td></tr>
<tr><td><b>مراقبة الفسحة</b></td><td>يُقدَّم من <b>ليس عنده حصة قبل الفسحة ولا بعدها مباشرة</b>، ثم معلمو المراقبة، ثم الأخف نصابًا.</td></tr>
<tr><td><b>العدل بين المعلمين</b></td><td>الأقل تأمينًا في السجل يُقدَّم، ثم الأخف حصصًا في ذلك اليوم.</td></tr>
<tr><td><b>المستثنون</b></td><td>من له ظرف خاص لا يظهر في ترشيحات التأمين والمراقبة.</td></tr>
<tr><td><b>بعد الاعتذار</b></td><td>ينتقل التكليف <b>تلقائيًا</b> للبديل التالي بنفس القواعد، حتى لو صفحة الإدارة مقفلة.</td></tr></table>
<div class="box gold" style="margin-top:5mm">💡 <b>التلقائي ليس نهائيًا:</b> تقدر تغيّر أي حصة بضغطة على اسم آخر، أو من القائمة الكاملة تحت الأزرار.</div>
{foot(T, 3, N)}</section>''')
    colors = [('#1f9d55', 'أخضر', '✓ استلم أ. فلان التكليف', 'تم، ما عليك شيء'),
              ('#e8730c', 'برتقالي', '↺ اعتذر أ. فلان ← انتقل إلى أ. فلان (بانتظار استلامه)', 'النظام حوّله لزميل، تابع فقط'),
              ('#c62828', 'أحمر ينبض', '⚠ أ. فلان يطلب الرجوع للتكليف — قرر الآن', 'يحتاج قرارك'),
              ('#8e1b1b', 'أحمر غامق', '✕ اعتذر أ. فلان وما فيه بديل — أسندها لأحد', 'حصة بدون مؤمّن'),
              ('#d9b56a', 'ذهبي فاتح', '⏳ بانتظار استلام أ. فلان', 'انرسل وما رد بعد'),
              ('#2563a8', 'أزرق', '🛡 تؤمّنها الإدارة: الأخصائي الاجتماعي', 'الإدارة تغطي الحصة')]
    rows = ''.join(f'<tr><td><span class="sw" style="background:{c}"></span><b>{n}</b></td><td>{e}</td><td>{m}</td></tr>' for c, n, e, m in colors)
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">٣</span>ردود المعلمين بالألوان</h2>
<p class="lead">كل تكليف بطاقة فوقها شريط بلون حالته الأخيرة، وفوق القائمة عدّاد بنفس الألوان يعطيك وضع اليوم كله.</p>
<table><tr><th style="width:22%">اللون</th><th>مثال الشريط</th><th style="width:24%">معناه</th></tr>{rows}</table>
<h3>شريط التنبيهات</h3>
<p>أي اعتذار أو طلب رجوع يطلع <b>فوق في أي صفحة</b> مع رسالة منبثقة ورقم أحمر على التبويب:</p>
{shot('a_alert.png', 15)}
<p style="font-size:9.5pt;margin-top:2mm">«اتخذ قرار» يفتح لك التكليف مباشرة، و«تم الاطلاع» يخفي التنبيه.</p>
{shot('a_resp.png', 72, '', 'top')}
{foot(T, 4, N)}</section>''')
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">٤</span>التحكم الكامل للإدارة</h2>
<p class="lead">القرار الأخير دائمًا للإدارة، والمكلَّف الأول هو صاحب الأولوية.</p>
<table><tr><th style="width:32%">الأداة</th><th>عملها</th></tr>
<tr><td><b>إسناد إلى…</b></td><td>تحت كل تكليف: أسنده لأي معلم. المعتذرون يطلعون أولًا (يعني رفض عذرهم ويوصلهم «أعادت الإدارة التكليف لك»)، ثم المرشّحون بالترتيب.</td></tr>
<tr><td><b>🛡 الإدارة تؤمّن</b></td><td>يغطيها أحد الإداريين (المدير المساعد، الأخصائي الاجتماعي، …) وتُعدَّل القائمة من «الإعدادات».</td></tr>
<tr><td><b>↩ إرجاعه للمكلّف الأول</b></td><td>يرجع التكليف لصاحبه الأصلي، ويُعفى الزميل.</td></tr>
<tr><td><b>طلب الرجوع ⭐</b></td><td>إذا تراجع المكلّف الأول بعد ما استلم الزميل: «اعتماد رجوعه» أو «إبقاء الزميل».</td></tr>
<tr><td><b>سجل التكليف</b></td><td>مطوي تحت كل بطاقة ومرقّم. الإسنادات القديمة مشطوبة «أُلغي بإسناد لاحق»، و<b>الإسناد الأخير هو المعتمد</b>.</td></tr></table>
<h3>المُعفى والمُكلَّف</h3>
<p>من تُعفيه يوصله: «✓ أعفتك الإدارة من تكليف… ما تحتاج تحضرها، شكرًا لك» وتختفي البطاقة عنده. ومن تُسند له يوصله تكليف جديد وعليه أن يستلمه.</p>
<h3>✎ الاستيضاح الرسمي</h3>
<p>من زر «استيضاح» بجانب أي معلم (عدم حضور تأمين، مراقبة، رفض تبديل). يوصله في التطبيق ويرد، والرد ينحفظ عندك، ويُطبع <b>بترويسة الوزارة وتواقيع المعلم والمدير المساعد والمدير</b>.</p>
<h3>✉ المحادثة</h3>
<p>محادثة داخلية مع كل معلم من تبويب «ردود المعلمين»، وهوية المرسل من رمزه لا من اسم يكتبه.</p>
{foot(T, 5, N)}</section>''')
    pages.append(f'''<section class="page">{top(T)}
<h2><span class="n">٥</span>رموز دخول المعلمين</h2>
<ol><li>من «ردود المعلمين» ← <b>«رموز دخول المعلمين»</b> اضغط <b>«تجهيز الرموز»</b>.</li>
<li>لكل معلم رمز من ٦ أرقام، و<b>المشرف يدخل بنفس رمزه</b> ويطلع له «تكليفاتي» و«المتابعة».</li>
<li>«نسخ الرسالة» ينسخ رسالة جاهزة فيها الرابط والرمز لترسلها للمعلم، و«نسخ الكل» للجميع.</li>
<li>إذا انتشر رمز أو تشككت فيه: <b>«تجديد الرموز»</b> يلغي القديمة ويعطي جديدة.</li></ol>
{shot('a_codes.png', 52, 'قائمة الرموز (الأرقام مخفية في هذه الصورة).')}
<div class="box red" style="margin-top:4mm">🔒 <b>رمز صفحة الإدارة</b> لا يُكتب في أي ورقة ولا يُرسل في المجموعات؛ يُسلَّم شخصيًا للمدير المساعد.</div>
<div class="box gold">📲 <b>للمعلمين:</b> وزّع عليهم «دليل المعلم» وفيه باركود التثبيت وطريقته بالصور.</div>
{sign_block()}
{foot(T, 6, N)}</section>''')
    return pages

def html(pages, title):
    return f'<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>'

open(OUT + 'teacher.html', 'w', encoding='utf-8').write(html(teacher(), 'دليل المعلم'))
open(OUT + 'admin.html', 'w', encoding='utf-8').write(html(admin(), 'دليل الإدارة'))
print('ok')
