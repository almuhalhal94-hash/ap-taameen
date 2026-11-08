const { chromium } = require('playwright');
const out = __dirname + '/guide/';
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ deviceScaleFactor: 2 });
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;' }));
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#demoNote,.sync-note,#toast,.toast{display:none!important} .tabs,nav,header,.sticky{position:static!important}'; document.head.appendChild(st); }); });
  const logs = []; const w = (p, t) => p.on('pageerror', e => logs.push(t + ' ERR ' + e.message));
  const A = await ctx.newPage(); await A.setViewportSize({ width: 1180, height: 900 }); w(A, 'admin');
  await A.goto('http://localhost:8766/index.html'); await A.waitForTimeout(900);
  await A.evaluate(() => document.querySelectorAll('body > div[style*="position:fixed"]').forEach(x => x.remove()));
  await A.fill('#dateInput', '2026-11-09'); await A.dispatchEvent('#dateInput', 'change'); await A.waitForTimeout(300);
  for (const n of ['فلاح', 'يعقوب', 'طلال']) { await (await A.$(`#absList button:has-text("${n}")`)).click(); await A.waitForTimeout(250); }
  await A.screenshot({ path: out + 'a_cover.png', fullPage: false });
  await A.mouse.move(5, 5); const rc = await A.$('#resultCard'); if (rc) await rc.screenshot({ path: out + 'a_result.png' });
  // الوضع اليدوي
  const man = await A.$('[data-mode="manual"][data-key="coverMode"]'); if (man) { await man.click(); await A.waitForTimeout(300); await (await A.$('#resultCard')).screenshot({ path: out + 'a_manual.png' }); await (await A.$('[data-mode="auto"][data-key="coverMode"]')).click(); await A.waitForTimeout(300); }
  await A.click('[data-send-now]'); await A.waitForTimeout(400);
  await A.click('.tab[data-tab="app"]'); await A.click('#btnLinks'); await A.waitForTimeout(800);
  await A.evaluate(() => { const w = document.createTreeWalker(document.querySelector('#linkList') || document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { n.nodeValue = n.nodeValue.replace(/\b\d{6}\b/g, '••••••').replace(/http:\/\/localhost:8766/g, 'https://ap-taameen.web.app'); } }); const ll = await A.$('#linkList'); if (ll) await ll.screenshot({ path: out + 'a_codes.png' });
  const st = await A.evaluate(() => ({ codes: window.APT.settings.codes, docs: JSON.parse(localStorage.getItem('apt-sync-demo')).assign }));
  const covers = Object.values(st.docs).filter(d => d.kind === 'cover' && d.to);
  const P = await ctx.newPage(); await P.setViewportSize({ width: 390, height: 844 }); w(P, 't');
  // شاشة الدخول
  await P.goto('http://localhost:8766/app/'); await P.waitForTimeout(800);
  await P.click('#codeBoxes'); await P.keyboard.type(st.codes[covers[0].to].slice(0, 4)); await P.waitForTimeout(300);
  await P.screenshot({ path: out + 't_login.png' });
  await P.keyboard.type(st.codes[covers[0].to].slice(4)); await P.click('#loginBtn'); await P.waitForTimeout(1500);
  await P.screenshot({ path: out + 't_card.png' });
  await P.click('#btnYes'); await P.waitForTimeout(1200); await P.screenshot({ path: out + 't_accept.png' });
  await P.click('[data-x="close"]'); await P.waitForTimeout(400);
  await P.click('#btnNo'); await P.waitForTimeout(500); await P.click('#rsn button[data-r="3"]'); await P.waitForTimeout(200);
  await P.screenshot({ path: out + 't_excuse.png' });
  await P.click('[data-x="close"]'); await P.waitForTimeout(400);
  await P.click('#btnYes'); await P.waitForTimeout(300); await P.click('[data-x="go"]'); await P.waitForTimeout(700);
  await P.screenshot({ path: out + 't_undo.png' });
  await P.waitForTimeout(9000); await P.screenshot({ path: out + 't_done.png' });
  // معلم ثاني يعتذر
  const other = covers.find(d => d.to !== covers[0].to);
  const P2 = await ctx.newPage(); await P2.setViewportSize({ width: 390, height: 844 }); w(P2, 't2');
  await P2.goto('http://localhost:8766/app/?k=' + st.codes[other.to]); await P2.waitForTimeout(1200);
  await P2.click('#btnNo'); await P2.waitForTimeout(300); await P2.click('#rsn button[data-r="3"]'); await P2.click('[data-x="go"]'); await P2.waitForTimeout(1500);
  await P2.screenshot({ path: out + 't_after_excuse.png' });
  // مشرف
  const supId = Object.keys(await A.evaluate(() => window.APT.settings.supervise))[0];
  const P3 = await ctx.newPage(); await P3.setViewportSize({ width: 390, height: 844 }); w(P3, 'sup');
  await P3.goto('http://localhost:8766/app/?k=' + st.codes[supId]); await P3.waitForTimeout(1200);
  const sb = await P3.$('#bar button[data-v="sup"]'); if (sb) { await sb.click(); await P3.waitForTimeout(400); }
  await P3.screenshot({ path: out + 't_sup.png' });
  // الإداري: الألوان والتنبيه
  await A.click('.tab[data-tab="today"]'); await A.waitForTimeout(500);
  const al = await A.$('#appAlerts'); if (al) await al.screenshot({ path: out + 'a_alert.png' });
  await A.click('.tab[data-tab="app"]'); await A.waitForTimeout(600);
  await A.evaluate(() => { const l = document.querySelector('#respList'); [...l.querySelectorAll('.resp')].forEach((x, i) => { if (i > 5 && !/v-(moved|ok|act)/.test(x.className)) x.remove(); }); });
  await A.mouse.move(5, 5); await A.waitForTimeout(300); await (await A.$('#respList')).screenshot({ path: out + 'a_resp.png' });
  console.log(logs.join('\n') || 'no errors'); await b.close();
})();
