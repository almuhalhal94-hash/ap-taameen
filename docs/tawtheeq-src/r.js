const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.4 });
  await p.goto('file://' + __dirname + '/t.html'); await p.waitForTimeout(800);
  console.log(await p.evaluate(() => [...document.querySelectorAll('.page')].map(pg => { const b = pg.querySelector('.body'); return [pg.scrollHeight, pg.clientHeight, b.scrollHeight, b.clientHeight]; })));
  await p.pdf({ path: __dirname + '/out.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = await p.$$('.page'); for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: __dirname + `/pg${i + 1}.png` });
  await b.close();
})();
