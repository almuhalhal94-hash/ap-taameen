// node rnd.js preview t1 t2 ...  |  node rnd.js all <fps> <worker> <nworkers>
const {chromium}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const ROOT=__dirname; const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));fs.stat(f,(e,s)=>{if(e||s.isDirectory()){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});});
(async()=>{await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
 const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl']});
 const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CON',m.text())});
 await p.goto(`http://localhost:${port}/film.html`);await p.waitForFunction(()=>window.READY,null,{timeout:60000});
 const mode=process.argv[2];
 if(mode==='seq'){for(const t of process.argv.slice(3).map(Number)){await p.evaluate(t=>renderAt(t),t);const r=await p.evaluate(()=>[...document.querySelectorAll('.blk')].map(e=>e.id+':'+e.style.opacity).filter(x=>!x.endsWith(':0')).join(',')+' W:'+[...document.querySelectorAll('.blk')].filter(e=>e.style.opacity!=='0').map(e=>[...e.querySelectorAll('.tt .w')].map(w=>w.style.opacity).join('')).join('|'));console.log(t,r);await p.screenshot({path:`pv/seq${t}.jpg`,type:'jpeg',quality:80});}}
 else if(mode==='preview'){fs.mkdirSync('pv',{recursive:true});for(const t of process.argv.slice(3).map(Number)){await p.evaluate(t=>renderAt(t),t);await p.evaluate(t=>renderAt(t),t);await p.screenshot({path:`pv/t${t.toFixed(2)}.jpg`,type:'jpeg',quality:88});process.stdout.write(t+' ');}}
 else{const fps=+process.argv[3],w=+process.argv[4],n=+process.argv[5],T=+(process.argv[6]||65);const N=Math.round(T*fps);fs.mkdirSync('frames',{recursive:true});const t0=Date.now();let c=0;
  for(let i=w*2;i<N;i+=n*2){const f=`frames/${String(i).padStart(5,'0')}.jpg`;if(fs.existsSync(f))continue;await p.evaluate(t=>renderAt(t),i/fps);await p.screenshot({path:f,type:'jpeg',quality:92});c++;if(c%50===0)console.log(`w${w} ${i}/${N} ${((Date.now()-t0)/c).toFixed(0)}ms/f`);}}
 await b.close();srv.close();})();
