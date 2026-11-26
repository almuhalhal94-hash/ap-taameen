// تصوير كل حالات التطبيق الحقيقية فريم فريم (وضع التجربة، بلا سحابة)
const {chromium}=require('playwright'); const fs=require('fs');
const OUT=__dirname+'/st'; fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT);
const SEL=['#codeBoxes','#loginBtn','#btnYes','#btnNo','#btnReq','#stack .card.top','#stack .card.top .per','#stack .card.top .tm','#stack .card.top .code','#stack .card.top .for','[data-x=go]','[data-x=close]','#snack','#snackUndo','#rsn [data-r="1"]','#rqDate','#rqPer','#rqWhy','#tabSup','#tabTasks','#supList','#reqList','#reqList .item','#toast','.sheet','#supSum','#v-sup .day-h'];
const R={};
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:false,locale:'ar'});
 await ctx.route('**/firebase-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.FIREBASE_CONFIG=null;'}));
 await ctx.route(/gstatic|googleapis|firebaseio/i,r=>r.abort());
 await ctx.addInitScript({content:fs.readFileSync(__dirname+'/seed.js','utf8')});
 await ctx.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='#demoNote,#btnNotif{display:none!important} *{caret-color:transparent!important}';document.head.appendChild(st);});});
 let p;
 const rects=()=>p.evaluate(S=>{const o={};for(const s of S){const e=document.querySelector(s);if(e&&e.getClientRects().length){const r=e.getBoundingClientRect();if(r.width&&r.height)o[s]=[r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10);}}
   o.__per=[...document.querySelectorAll('#rqPer [data-p]')].map(e=>{const r=e.getBoundingClientRect();return [e.dataset.p,r.x,r.y,r.width,r.height];});
   o.__rsn=[...document.querySelectorAll('#rsn [data-r]')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
   o.__sup=[...document.querySelectorAll('#supList .item')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
   return o;},SEL);
 const shot=async n=>{await p.screenshot({path:`${OUT}/${n}.jpg`,type:'jpeg',quality:93}); R[n]=await rects(); process.stdout.write(n+' ');};
 const flush=()=>p.evaluate(()=>new Promise(r=>{let i=0;const f=()=>++i>20?r():Promise.resolve().then(f);f();}));
 const pause=()=>p.evaluate(()=>{getComputedStyle(document.body).color;document.getAnimations().forEach(a=>a.pause());});
 const seek=t=>p.evaluate(t=>document.getAnimations().forEach(a=>{try{a.currentTime=t}catch(e){}}),t);
 const play=()=>p.evaluate(()=>document.getAnimations().forEach(a=>{try{const d=a.effect.getComputedTiming();if(d.endTime!==Infinity)a.finish();else a.play();}catch(e){}}));
 const sample=async(name,n,ms)=>{await pause();for(let i=0;i<n;i++){await seek(ms*i/(n-1));await shot(`${name}${String(i).padStart(2,'0')}`);}await play();};
 const tick=ms=>p.clock.runFor(ms);
 const open=async()=>{p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message)); p.on('console',m=>m.text().startsWith('REQS')&&console.log(m.text())); await p.clock.install({time:Date.now()}); await p.goto('http://localhost:8765/app/'); await p.waitForTimeout(800); await tick(500); await p.waitForTimeout(300);};

 // ===== المعلم =====
 await open();
 await shot('L0');
 await p.focus('#codeIn');
 for(const [i,d] of [...'246810'].entries()){ await p.keyboard.type(d); await shot('L'+(i+1)); }
 await p.click('#loginBtn'); await flush(); await tick(50); await flush();
 await p.waitForTimeout(50); await sample('TIN',8,500);
 await tick(400); await p.waitForTimeout(200); await shot('T0');
 // سحب يمين حقيقي
 const cb=R['T0']['#stack .card.top']; const cx=cb[0]+cb[2]/2, cy=cb[1]+cb[3]/2;
 await p.mouse.move(cx,cy); await p.mouse.down();
 for(let i=1;i<=9;i++){ await p.mouse.move(cx+i*19,cy+i*1.5); await shot('D'+String(i).padStart(2,'0')); }
 await p.mouse.up(); await flush();
 await sample('C',9,450);
 await shot('C_open');
 await p.click('.sheet [data-x=go]'); await flush(); await tick(5); await flush();
 await sample('F',9,480);
 await tick(600); await flush(); await tick(50); await p.waitForTimeout(150); await play(); await shot('A_done');
 await tick(8100); await p.waitForTimeout(500); await play(); await shot('E0');
 await p.click('#btnNo'); await flush();
 await sample('X',9,450); await shot('X_open');
 await p.click('#rsn [data-r="1"]'); await shot('X_pick');
 await p.click('.sheet [data-x=go]'); await flush(); await tick(5); await flush();
 await sample('RJ',9,480);
 await tick(600); await flush(); await tick(50); await p.waitForTimeout(150); await play(); await shot('RJ_done');
 await p.click('#snackUndo'); await flush(); await tick(5); await flush(); await tick(5);
 await sample('U',8,450); await tick(300); await p.waitForTimeout(400); await play(); await shot('U_done');
 await tick(9000); await p.waitForTimeout(500); await play(); await shot('E1');
 // طلب التبديل
 await p.click('#btnReq'); await flush(); await p.waitForTimeout(400); await play();
 await p.evaluate(()=>{const d=document.querySelector('#rqDate'); d.value=''; d.dispatchEvent(new Event('change'));});
 await p.evaluate(()=>{for(const s of ['.sheet','.sheet-bg']){const e=document.querySelector(s);e.style.animation='none';e.offsetWidth;e.style.animation='';}});
 await sample('Q',9,320); await shot('Q_blank');
 const tm=new Date(Date.now()+86400000); const pad=n=>String(n).padStart(2,'0'); const iso=`${tm.getFullYear()}-${pad(tm.getMonth()+1)}-${pad(tm.getDate())}`;
 await p.evaluate(v=>{const d=document.querySelector('#rqDate'); d.value=v; d.dispatchEvent(new Event('change'));},iso); await shot('Q_day');
 await p.click('#rqPer [data-p]'); await tick(400); await shot('Q_pick');
 const why='موعد رسمي'; const steps=[1,3,4,6,8,9];
 for(const [i,k] of steps.entries()){ await p.fill('#rqWhy',why.slice(0,k)); await shot('Q_r'+(i+1)); }
 await p.click('.sheet [data-x=go]'); await flush(); await tick(5); await flush(); await tick(5);
 await sample('S',7,360); await tick(300); await p.waitForTimeout(300); await play(); await shot('S_done');
 await p.evaluate(()=>window.scrollTo(0,0));
 await p.evaluate(async ()=>{const S=await window.Sync.ready; const all=JSON.parse(localStorage.getItem('apt-sync-demo')); const ids=Object.keys(all.msgs).filter(k=>all.msgs[k].type==='req'); console.log('REQS',ids.length); const id=ids[0]; for(const k of ids.slice(1)) await S.set('msgs/'+k,{status:'cancelled'});
   await S.set('msgs/'+id,{status:'approved',result:[{ok:true,txt:'حصتك الثالثة (2ع1) يدخلها أ. عمر محمد إرشاد، وتدخل أنت حصته السادسة'}],decidedAt:Date.now(),readT:false});});
 await tick(50); await flush(); await tick(3200); await p.waitForTimeout(400); await play(); await shot('S_ok');
 await p.evaluate(()=>{const v=document.scrollingElement; v.scrollTo(0,200);}); await shot('S_ok_scroll');
 await p.close();
 // ===== المشرف =====
 p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message)); await p.addInitScript(()=>{localStorage.removeItem('apt-key');sessionStorage.removeItem('seeded');});
 await p.clock.install({time:Date.now()}); await p.goto('http://localhost:8765/app/'); await p.waitForTimeout(800); await tick(500); await p.waitForTimeout(300);
 await shot('P_L0'); await p.focus('#codeIn');
 for(const [i,d] of [...'135790'].entries()){ await p.keyboard.type(d); if(i===5) await shot('P_L6'); }
 await p.click('#loginBtn'); await flush(); await tick(50); await flush(); await p.waitForTimeout(50);
 await sample('PIN',6,500); await tick(400); await p.waitForTimeout(200); await play(); await shot('P_T0');
 await p.click('#tabSup'); await flush(); await sample('PS',6,250); await shot('P_S0');
 fs.writeFileSync(OUT+'/rects.json',JSON.stringify(R)); console.log('\nDONE',Object.keys(R).length);
 await b.close();
})();
