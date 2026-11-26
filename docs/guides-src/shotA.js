const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1700 } });
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;' }));
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.sheet-bg,.modal{background:transparent!important} #demoNote,.toast,#toast{display:none!important}.tabs,.day-sum{position:static!important}'; document.head.appendChild(st); }); });
  const p = await ctx.newPage(); const logs = []; p.on('pageerror', e => logs.push(e.message));
  await p.goto('http://localhost:8766/index.html'); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelectorAll('body > div[style*="position:fixed"]').forEach(x => x.remove()));
  await p.fill('#dateInput', '2026-11-09'); await p.dispatchEvent('#dateInput', 'change'); await p.waitForTimeout(300);
  for (const k of [2, 17]) { await p.locator('#absList [data-abs]').nth(k).click(); await p.waitForTimeout(150); }
  await p.mouse.move(0, 0); await p.waitForTimeout(300);
  await (await p.$('#daySum')).screenshot({ path: __dirname + '/guide/a_sum.png' });
  await (await p.$('#resultCard')).screenshot({ path: __dirname + '/guide/a_result.png' });
  await p.locator('#resTable [data-chg]').nth(1).click(); await p.waitForTimeout(500);
  await (await p.$('.pick-box')).screenshot({ path: __dirname + '/guide/a_pick.png' });
  console.log(logs.join('\n') || 'ok'); await b.close();
})();
