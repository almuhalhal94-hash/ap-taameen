const { chromium } = require('playwright');
const fs = require('fs'); const d = __dirname, A = '/home/user/ap-taameen';
const b64 = (f, t) => `data:${t};base64,` + fs.readFileSync(f).toString('base64');
const card = (title, sub, qr, url, steps, note) => `<html dir="rtl"><head><style>
@font-face{font-family:R;src:url(file://${A}/assets/fonts/readex-pro-arabic-400-normal.woff2)}
@font-face{font-family:R;font-weight:700;src:url(file://${A}/assets/fonts/readex-pro-arabic-700-normal.woff2)}
@font-face{font-family:Am;src:url(file://${A}/assets/fonts/amiri-arabic-700-normal.woff2)}
body{margin:0;width:1080px;height:1350px;font-family:R,sans-serif;background:radial-gradient(900px 500px at 50% 0%,#7a0f1d,#4d0610 60%,#2b0408);color:#fff;display:flex;flex-direction:column;align-items:center;overflow:hidden}
.hd{width:100%;background:#fff;border-bottom:6px solid #e2b45a;text-align:center}.hd img{width:780px;display:block;margin:0 auto}
.ic{width:110px;height:110px;border-radius:26px;margin-top:30px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
h1{font-family:Am,serif;font-size:70px;margin:10px 0 0;color:#f6d690;line-height:1.2}
h2{margin:0;font-size:34px;font-weight:400;color:#f3e3d0}
.qr{background:#fff;border-radius:36px;padding:34px;margin-top:30px;box-shadow:0 20px 50px rgba(0,0,0,.45);text-align:center}
.qr img{width:420px;height:420px;display:block}.qr b{display:block;direction:ltr;color:#7a0a16;font-size:32px;margin-top:10px}
ol{list-style:none;padding:0;margin:34px 0 0;display:flex;gap:18px}
li{background:rgba(255,255,255,.1);border:1px solid rgba(246,214,144,.5);border-radius:20px;padding:14px 20px;font-size:25px;max-width:290px;text-align:center}
li i{font-style:normal;display:block;color:#f6d690;font-weight:700;font-size:30px}
.nt{margin-top:24px;font-size:22px;color:#f3e3d0}
.prep{margin-top:auto;width:100%;border-top:3px solid #e2b45a;background:rgba(0,0,0,.25);text-align:center;padding:22px 0 26px;font-size:24px;color:#f3e3d0}.prep b{display:block;font-family:Am,serif;font-size:44px;color:#f6d690;line-height:1.3}</style></head><body>
<div class="hd"><img src="${b64(A + '/assets/header.jpg', 'image/jpeg')}"></div>
<img class="ic" src="${b64(A + '/app/icon-192.png', 'image/png')}">
<h1>${title}</h1><h2>${sub}</h2>
<div class="qr"><img src="${b64(d + '/' + qr, 'image/svg+xml')}"><b>${url}</b></div>
<ol>${steps.map((s, i) => `<li><i>${'١٢٣'[i]}</i>${s}</li>`).join('')}</ol>${note ? `<p class="nt">${note}</p>` : ''}<div class="prep">إعداد<b>أ. طلال سعود</b></div></body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  for (const [f, h] of [
    ['باركود_المعلمين.png', card('تطبيق التأمين والتبديل', 'للمعلمين والمشرفين', 'qr_app.svg', 'ap-taameen.web.app/app', ['امسح الباركود بكاميرا الجوال', 'أضفه للشاشة الرئيسية كتطبيق', 'ادخل برمزك من ٦ أرقام'], 'الرمز يوصلك من الإدارة — لا تشاركه مع أحد')],
    ['باركود_الإدارة.png', card('تطبيق التأمين والتبديل', 'لوحة الإدارة', 'qr_admin.svg', 'ap-taameen.web.app', ['امسح الباركود أو افتح الرابط', 'يُفضَّل على اللابتوب', 'ادخل برمز الإدارة الخاص'], '')]]) {
    await p.setContent(h); await p.waitForTimeout(500); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: d + '/' + f });
  }
  await b.close(); console.log('ok');
})();
