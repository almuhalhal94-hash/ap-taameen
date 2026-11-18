const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file://' + __dirname + '/i2.html'); await p.waitForTimeout(800);
console.log('height', await p.evaluate(() => document.body.scrollHeight));
await p.screenshot({ path: __dirname + '/install.png', fullPage: true }); await b.close(); })();
