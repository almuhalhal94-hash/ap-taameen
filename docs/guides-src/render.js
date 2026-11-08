const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [f, o] of [['teacher', 'دليل_المعلم_تطبيق_التأمين.pdf'], ['admin', 'دليل_الإدارة_تطبيق_التأمين.pdf']]) {
    await p.setViewportSize({ width: 794, height: 1123 });
    await p.goto('file://' + __dirname + '/' + f + '.html'); await p.waitForTimeout(800); await p.evaluate(() => document.fonts.ready);
    await p.pdf({ path: __dirname + '/' + o, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const n = await p.evaluate(() => document.querySelectorAll('.page').length);
    for (let i = 0; i < n; i++) { const el = (await p.$$('.page'))[i]; await el.screenshot({ path: __dirname + `/prev_${f}_${i + 1}.png` }); }
    const ov = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => {
      const r = pg.getBoundingClientRect();
      const last = [...pg.querySelectorAll('*')].filter(x => !x.closest('.foot') && !x.closest('.crop')).reduce((m, x) => Math.max(m, x.getBoundingClientRect().bottom), 0);
      return (last - r.top > r.height - 45) ? `p${i + 1} overflow ${Math.round(last - r.top)}/${Math.round(r.height)}` : '';
    }).filter(Boolean));
    console.log(f, n, 'pages', ov.join(' ') || 'fit');
  }
  await b.close();
})();
