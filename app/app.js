// تطبيق المعلم / المشرف — الدخول برمز خاص، والتكليف يُستلم بالسحب يمين، والاعتذار بعذر رسمي فقط
(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ORDER = ['1', '2', 'B1', '3', 'B2', '4', '5', '6', '7'];
  const KIND = { cover: 'تأمين حصة', duty: 'مراقبة فسحة', swap: 'تبديل حصة' };
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const TODAY = isoOf(new Date());
  const now = () => Date.now();
  const fmtTime = ms => new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  const fmtDay = ms => new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));
  const dayLabel = d => d.date === TODAY ? 'اليوم' : `يوم ${d.day}`;
  const gDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d}-${m}-${y}`; };
  const short = n => String(n || '').replace(/^أ\.\s*/, '');
  // رمز الصف حرف حرف بنفس ترتيب الجدول (مثل 2ع3)
  const code = c => c ? c.split(' / ').map(x => `<bdi class="cc">${[...x].map(ch => `<i>${esc(ch)}</i>`).join('')}</bdi>`).join(' / ') : '';
  $('#today').textContent = fmtDay(now());

  // ---------- الأصوات (تسجيلات حقيقية CC0 من مكتبة talal-sound) ----------
  const SND = (() => {
    const files = { swipe: ['swipe', 'swipe2', 'swipe3'], tap: ['tap', 'tap2', 'tap3'], accept: ['accept'], reject: ['reject'], notify: ['notify'], send: ['send'] };
    const vol = { swipe: .45, tap: .35, accept: .6, reject: .5, notify: .55, send: .45 };
    const cache = {}, last = {};
    const get = f => cache[f] || (cache[f] = Object.assign(new Audio(`snd/${f}.mp3`), { preload: 'auto' }));
    Object.values(files).flat().forEach(get);
    return name => {
      const opts = files[name]; if (!opts) return;
      let f = opts[Math.floor(Math.random() * opts.length)];
      if (opts.length > 1 && f === last[name]) f = opts[(opts.indexOf(f) + 1) % opts.length];
      last[name] = f;
      try { const a = get(f).cloneNode(); a.volume = vol[name]; a.play().catch(() => { }); } catch (e) { }
    };
  })();
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
  let toastT;
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); };
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } }, del: k => { try { localStorage.removeItem(k); } catch (e) { } } };

  // ---------- الدخول ----------
  const S = await window.Sync.ready;
  $('#demoNote').hidden = S.mode !== 'demo';
  const showView = v => document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'v-' + v));
  const fromUrl = new URLSearchParams(location.search).get('k') || (location.hash.match(/^#k-([a-z0-9-]+)$/i) || [])[1];
  if (fromUrl) { store.set('apt-key', fromUrl); history.replaceState(null, '', location.pathname); }
  const lookup = async k => { if (!k) return null; const p = await S.get('people/' + k).catch(() => null); return p && p.tid && !p.revoked ? p : null; };
  let me = await lookup(store.get('apt-key'));
  if (!me) {
    store.del('apt-key');
    me = await new Promise(res => {
      showView('login');
      const inp = $('#codeIn'), boxes = [...document.querySelectorAll('#codeBoxes i')];
      const paint = () => { const v = inp.value.replace(/\D/g, '').slice(0, 6); inp.value = v; boxes.forEach((b, i) => { b.textContent = v[i] || ''; b.classList.toggle('f', i < v.length); b.classList.toggle('cur', i === v.length); }); $('#loginBtn').disabled = v.length !== 6; $('#loginErr').textContent = ''; };
      inp.addEventListener('input', paint); $('#codeBoxes').addEventListener('click', () => inp.focus());
      paint(); setTimeout(() => inp.focus(), 300);
      $('#loginForm').addEventListener('submit', async e => {
        e.preventDefault(); const k = inp.value;
        $('#loginBtn').disabled = true; $('#loginBtn').textContent = 'جاري التحقق…';
        const p = await lookup(k);
        $('#loginBtn').textContent = 'دخول';
        if (!p) { inp.value = ''; paint(); $('#loginErr').textContent = 'الرمز غير صحيح. تأكد منه أو اطلبه من المدير المساعد.'; SND('reject'); buzz([30, 40, 30]); document.querySelector('.code-boxes').classList.add('shake'); setTimeout(() => document.querySelector('.code-boxes').classList.remove('shake'), 500); return; }
        store.set('apt-key', k); SND('accept'); res(p);
      });
    });
  }
  const ME = me.tid;
  // المشرف برمز المشرف: شاشة المتابعة. والروابط القديمة: الاثنين معًا
  const ROLE = me.role || (me.sup ? 'both' : 'teacher');
  const SUP = ROLE === 'sup' || ROLE === 'both', TEACH = ROLE !== 'sup';
  $('#top').hidden = false; $('#bar').hidden = false;
  $('#myName').textContent = me.name;
  $('#roleTitle').textContent = ROLE === 'sup' ? 'متابعة المشرف' : 'التأمين والتبديل';
  $('#tabSup').hidden = !SUP; $('#tabTasks').hidden = !TEACH; $('#tabExp').hidden = !TEACH;
  $('#meBtn').addEventListener('click', () => sheet(`<h3>${esc(me.name)}</h3><p class="muted">${ROLE === 'sup' ? 'دخلت برمز المشرف' : 'دخلت برمز المعلم'}</p>
    <div class="sheet-btns"><button class="b-ghost" data-x="out">تسجيل الخروج</button><button class="b-ok" data-x="close">رجوع</button></div>`, { out: () => { store.del('apt-key'); location.reload(); } }));

  // ---------- التنقل ----------
  let cur = '', mine = [], refusedByMe = [], released = [], supL = [], exps = [], msgs = [];
  function show(v) {
    showView(v); cur = v;
    document.querySelectorAll('#bar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'chat') { renderChat(); markChatRead(); }
    if (v === 'sup') renderSup();
  }
  $('#bar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { SND('tap'); show(b.dataset.v); } });
  const setNb = (id, n) => { const el = $(id); el.hidden = !n; el.textContent = n; };
  const hr = new Date().getHours();
  $('#hello').innerHTML = `${hr < 12 ? 'صباح الخير' : 'مساء الخير'}، <b>${esc(short(me.name))}</b>`;

  // ---------- التنبيهات ----------
  const canNotify = 'Notification' in window;
  if (canNotify && Notification.permission === 'default') $('#btnNotif').hidden = false;
  $('#btnNotif').addEventListener('click', async () => { try { await Notification.requestPermission(); } catch (e) { } $('#btnNotif').hidden = true; });
  const seenKey = 'apt-seen-' + ME;
  let seen = new Set(); try { seen = new Set(JSON.parse(store.get(seenKey) || '[]')); } catch (e) { }
  let firstLoad = true;
  function alertNew(id, title, body) {
    if (seen.has(id)) return;
    seen.add(id); store.set(seenKey, JSON.stringify([...seen].slice(-300)));
    if (firstLoad) return;
    SND('notify'); buzz([60, 40, 60]);
    if (canNotify && Notification.permission === 'granted' && document.hidden) {
      const opt = { body, icon: 'icon-192.png', tag: id, lang: 'ar', dir: 'rtl' };
      (navigator.serviceWorker && navigator.serviceWorker.ready ? navigator.serviceWorker.ready.then(r => r.showNotification(title, opt)) : Promise.reject()).catch(() => { try { new Notification(title, opt); } catch (e) { } });
    }
  }

  // ---------- نافذة سفلية عامة ----------
  function sheet(html, acts = {}, onOpen) {
    return new Promise(res => {
      const bg = $('#sheet'); $('#sheetBody').innerHTML = html; bg.hidden = false;
      if (onOpen) onOpen();
      const done = v => { bg.hidden = true; bg.onclick = null; res(v); };
      bg.onclick = e => {
        if (e.target === bg) return done(null);
        const b = e.target.closest('[data-x]'); if (!b) return;
        const x = b.dataset.x;
        if (x === 'close') return done(null);
        if (acts[x]) { const v = acts[x](); if (v !== false) done(v === undefined ? x : v); }
      };
    });
  }
  const summary = d => d.kind === 'duty'
    ? `<b>${esc(d.slotName)}</b> <span class="tm">${esc(d.time)}</span><br>📍 ${esc(d.label.replace('مراقبة — ', ''))}`
    : d.kind === 'swap'
      ? `تدخل حصة <b>${esc(d.slotName)}</b> (${code(d.c)}) بدل ${esc(d.absentName)}، ويدخل عنك حصتك <b>${esc(d.s2Name || '')}</b>`
      : `الحصة <b>${esc(d.slotName)}</b> <span class="tm">${esc(d.time)}</span> · ${code(d.c)} بدل ${esc(d.absentName)}`;

  // الاستلام: تأكيد قبل الإرسال
  const confirmAccept = d => sheet(`<div class="sh-ic ok">✓</div><h3>استلام التكليف</h3>
    <p class="sh-sum">${dayLabel(d)} · ${summary(d)}</p>
    <p class="muted">بالاستلام تلتزم بالحضور في الموعد، ويوصل للإدارة والمشرف إن التكليف تم.</p>
    <div class="sheet-btns"><button class="b-ok" data-x="go">نعم، استلمت</button><button class="b-ghost" data-x="close">رجوع</button></div>`, { go: () => true });

  // الاعتذار: بعذر رسمي فقط، والسبب إلزامي
  const REASONS = ['إجازة أو غياب رسمي معتمد', 'تكليف رسمي من الإدارة بنفس الوقت', 'تعارض مع حصتي أو مراقبتي بنفس الوقت', 'ظرف صحي طارئ', 'عذر رسمي آخر'];
  function askExcuse(d, after) {
    let pick = '';
    return sheet(`<div class="sh-ic warn">!</div><h3>${after ? 'طرأ عذر بعد الاستلام' : 'الاعتذار عن تكليف رسمي'}</h3>
      <p class="sh-sum">${dayLabel(d)} · ${summary(d)}</p>
      <div class="firm">التأمين ${d.kind === 'duty' ? 'والمراقبة ' : ''}تكليف رسمي من إدارة المدرسة، والحضور فيه واجب. لا يُقبل الاعتذار إلا بعذر رسمي، ويُرفع للمدير المساعد للنظر فيه، وقد يُطلب منك إيضاح.</div>
      <p class="lbl">العذر الرسمي <span class="req">*</span></p>
      <div class="reasons" id="rsn">${REASONS.map((r, i) => `<button type="button" data-r="${i}">${r}</button>`).join('')}</div>
      <textarea id="rsnTxt" rows="2" placeholder="توضيح (إلزامي لو اخترت «عذر رسمي آخر»)"></textarea>
      <p class="err" id="rsnErr"></p>
      <div class="sheet-btns"><button class="b-no" data-x="go">رفع الاعتذار للإدارة</button><button class="b-ghost" data-x="close">أتراجع، سأحضر</button></div>`, {
      go: () => {
        const t = $('#rsnTxt').value.trim();
        if (!pick) { $('#rsnErr').textContent = 'اختر العذر الرسمي أول.'; buzz(30); return false; }
        if (pick === REASONS[4] && t.length < 4) { $('#rsnErr').textContent = 'اكتب توضيح العذر.'; buzz(30); return false; }
        return [pick, t].filter(Boolean).join(' — ');
      }
    }, () => {
      const box = $('#rsn');
      box.onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; SND('tap'); pick = REASONS[+b.dataset.r]; box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('#rsnErr').textContent = ''; };
    });
  }

  // ---------- شريط التراجع ----------
  let snackT, snackFn = null;
  function snack(txt, undoFn) {
    const el = $('#snack'); $('#snackTxt').textContent = txt; snackFn = undoFn;
    $('#snackUndo').hidden = !undoFn;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(snackT); snackT = setTimeout(() => { el.classList.remove('show'); snackFn = null; }, 8000);
  }
  $('#snackUndo').addEventListener('click', async () => {
    const f = snackFn; snackFn = null; $('#snack').classList.remove('show'); clearTimeout(snackT);
    if (!f) return;
    SND('tap'); const ok = await f().catch(() => null);
    toast(ok ? 'تم التراجع' : 'ما يمدي التراجع — الزميل استلم التكليف');
  });

  // ---------- العمليات على التكليف ----------
  const tx = (id, fn) => S.tx('assign/' + id, fn).catch(() => null);
  const logOf = (c, act, extra) => [...(c.log || []), { tid: ME, name: me.name, act, at: now(), ...extra }];
  const accept = id => tx(id, c => c && c.to === ME && c.status === 'pending' ? { ...c, status: 'accepted', log: logOf(c, 'accepted'), updatedAt: now() } : null);
  const undoAccept = id => tx(id, c => c && c.to === ME && c.status === 'accepted' ? { ...c, status: 'pending', log: logOf(c, 'undo'), updatedAt: now() } : null);
  function refuse(id, note, act) {
    return tx(id, c => {
      if (!c || c.to !== ME || (c.status !== 'pending' && c.status !== 'accepted')) return null;
      const refused = [...new Set([...(c.refused || []), ME])];
      const mine = c.kind === 'swap' ? { s2: c.s2, s2Name: c.s2Name, s2Time: c.s2Time, t2: c.t2 } : {};
      const n = { ...c, refused, log: logOf(c, act, { note, mine }), updatedAt: now(), auto: true };
      const next = (c.backups || []).find(b => !refused.includes(typeof b === 'string' ? b : b.b));
      if (next) {
        const nid = typeof next === 'string' ? next : next.b;
        Object.assign(n, { to: nid, toName: (c.names || {})[nid] || '', status: 'pending' });
        if (c.kind === 'swap') Object.assign(n, { s2: next.s2, s2Name: next.s2Name || '', s2Time: next.s2Time || '', t2: next.t2 || '' });
      } else Object.assign(n, { to: '', toName: '', status: 'none' });
      return n;
    });
  }
  // المكلّف الأول تراجع والزميل استلم: يصير طلب عند الإدارة، وهي تقرر
  const askBack = id => tx(id, c => c && c.status === 'accepted' && (c.refused || []).includes(ME) && !c.returnReq
    ? { ...c, returnReq: { tid: ME, name: me.name, at: now() }, log: logOf(c, 'askback'), updatedAt: now() } : null);
  // الرجوع عن الاعتذار: ممكن ما دام ما أحد استلمه بعدي
  function comeBack(id, act) {
    return tx(id, c => {
      if (!c || c.status === 'accepted' || c.status === 'cancelled' || !(c.refused || []).includes(ME)) return null;
      const mineLog = [...(c.log || [])].reverse().find(l => l.tid === ME && l.mine) || {};
      const n = { ...c, refused: c.refused.filter(x => x !== ME), to: ME, toName: me.name, status: act === 'undo' ? 'pending' : 'accepted', auto: false, log: logOf(c, act), updatedAt: now() };
      if (c.kind === 'swap' && mineLog.mine) Object.assign(n, mineLog.mine);
      return n;
    });
  }

  // ---------- تكليفاتي ----------
  const sortD = (a, b) => a.date.localeCompare(b.date) || ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot);
  if (TEACH) {
    S.watch('assign', ['to', '==', ME], list => {
      mine = list.filter(d => d.date >= TODAY && d.status !== 'cancelled').sort(sortD);
      mine.filter(d => d.status === 'pending').forEach(d => alertNew('a:' + d.id + ':' + (d.log || []).length, 'تكليف جديد: ' + KIND[d.kind], `${dayLabel(d)} — ${d.slotName}${d.c ? ' ' + d.c : ''}`));
      renderTasks();
    });
    S.watch('assign', ['released', 'array-contains', ME], list => {
      released = list.filter(d => d.date >= TODAY && d.status !== 'cancelled').sort(sortD);
      released.filter(d => d.to !== ME).forEach(d => alertNew('r:' + d.id + ':' + d.to, 'أعفتك الإدارة من تكليف', `${dayLabel(d)} — ${d.slotName}`));
      renderDone();
    });
    S.watch('assign', ['refused', 'array-contains', ME], list => { refusedByMe = list.filter(d => d.date >= TODAY && d.status !== 'cancelled').sort(sortD); renderDone(); });
  }

  function cardHTML(d) {
    const when = `<div class="when"><b>${esc(dayLabel(d))}</b> · ${esc(gDate(d.date))}</div>`;
    let body;
    if (d.kind === 'duty') {
      body = `${when}<div class="per">${esc(d.slotName)}</div><span class="tm">${esc(d.time)}</span><div class="post">📍 ${esc(d.label.replace('مراقبة — ', ''))}</div>`;
    } else if (d.kind === 'swap') {
      body = `${when}<div class="xch">
          <div><small>تدخل بدل ${esc(d.absentName)}</small><b>الحصة ${esc(d.slotName)}</b> <span class="code sm">${code(d.c)}</span> <span class="tm s">${esc(d.time)}</span></div>
          <div class="arr">⇅</div>
          <div><small>ويدخل عنك</small><b>حصتك ${esc(d.s2Name || '')}</b> <span class="tm s">${esc(d.s2Time || '')}</span></div></div>`;
    } else {
      body = `${when}<div class="per">الحصة ${esc(d.slotName)}</div><span class="tm">${esc(d.time)}</span>
        <div class="cls"><span class="code">${code(d.c)}</span>${d.label && d.label !== 'حصة' ? `<span class="sub">${esc(d.label)}</span>` : ''}</div>`;
    }
    const forTxt = d.kind === 'swap' ? `طلب تبديل من <b>${esc(d.absentName)}</b>` : `بدل <b>${esc(d.absentName)}</b> ${d.out ? '(مستأذن)' : '(غائب)'}`;
    return `<div class="card-top"><span class="kind">${KIND[d.kind]}</span><span class="official">تكليف رسمي</span></div>${body}
      ${d.adminNote ? `<div class="anote">${esc(d.adminNote)}</div>` : ''}
      <div class="for">${forTxt}${d.auto ? '<span class="auto">تكليف محوّل لك</span>' : ''}</div>
      <div class="stamp yes">استلمت ✓</div><div class="stamp no">عذر رسمي</div>`;
  }

  function renderTasks() {
    const pend = mine.filter(d => d.status === 'pending');
    setNb('#nbTasks', pend.length);
    const stack = $('#stack'), ids = pend.slice(0, 3).map(d => d.id);
    [...stack.children].forEach(el => { if (!ids.includes(el.dataset.id) && !el.classList.contains('leaving')) el.remove(); });
    ids.slice().reverse().forEach((id, ri) => {
      const i = ids.length - 1 - ri, d = pend[i];
      let el = stack.querySelector(`[data-id="${CSS.escape(id)}"]:not(.leaving)`);
      if (!el) { el = document.createElement('div'); el.dataset.id = id; el.className = 'card enter'; stack.appendChild(el); setTimeout(() => el.classList.remove('enter'), 600); }
      if (el.dataset.sig !== JSON.stringify(d)) { el.innerHTML = cardHTML(d); el.dataset.sig = JSON.stringify(d); el._bound = false; }
      el.style.transform = ''; el.style.opacity = '';
      el.className = el.className.replace(/\b(top|back1|back2|k-\w+)\b/g, '').trim() + ` k-${d.kind} ` + (i === 0 ? 'top' : i === 1 ? 'back1' : 'back2');
      el.style.zIndex = 3 - i;
    });
    const has = pend.length > 0;
    $('#emptyTasks').hidden = has; $('#acts').hidden = !has; $('#swipeHint').hidden = !has;
    $('#stack').style.height = has ? '' : '0';
    bindTop(); renderDone();
  }
  function renderDone() {
    const acc = mine.filter(d => d.status === 'accepted');
    const line = d => `${esc(dayLabel(d))} · ${d.kind === 'duty' ? esc(d.time) + ' · ' + esc(d.label.replace('مراقبة — ', '')) : esc(d.time) + (d.c ? ' · ' + code(d.c) : '') + ' · بدل ' + esc(d.absentName)}`;
    const rows = [
      ...acc.map(d => `<div class="item"><span class="dot ok"></span><div class="grow"><div class="t">${KIND[d.kind]} — ${esc(d.slotName)}</div><div class="s">${line(d)}</div></div>
        <div class="side"><span class="tag ok">استلمت ✓</span><button class="mini" data-withdraw="${d.id}">طرأ عذر؟</button></div></div>`),
      ...refusedByMe.map(d => {
        const can = d.status !== 'accepted', asked = d.returnReq && d.returnReq.tid === ME;
        const act = can ? `<button class="mini go" data-back="${d.id}">تراجعت، سأحضر</button>`
          : asked ? '<small class="wait-t">طلبك عند الإدارة</small>' : `<button class="mini" data-ask="${d.id}">استلمه زميل — اطلب الرجوع</button>`;
        return `<div class="item dim"><span class="dot bad"></span><div class="grow"><div class="t">${KIND[d.kind]} — ${esc(d.slotName)}</div><div class="s">${line(d)}</div></div>
        <div class="side"><span class="tag">اعتذرت</span>${act}</div></div>`;
      }),
      ...released.filter(d => d.to !== ME && !(d.refused || []).includes(ME)).map(d => `<div class="item dim"><span class="dot"></span><div class="grow"><div class="t">${KIND[d.kind]} — ${esc(d.slotName)}</div><div class="s">${line(d)}</div></div>
        <div class="side"><span class="tag">أعفتك الإدارة</span><small class="muted">شكرًا لك</small></div></div>`)
    ];
    $('#doneHead').hidden = !rows.length;
    $('#doneList').innerHTML = rows.join('');
  }
  $('#doneList').addEventListener('click', async e => {
    const w = e.target.closest('[data-withdraw]'), b = e.target.closest('[data-back]'), q = e.target.closest('[data-ask]');
    if (q) {
      const d = refusedByMe.find(x => x.id === q.dataset.ask); if (!d) return;
      const ok = await sheet(`<div class="sh-ic ok">↺</div><h3>طلب الرجوع للتكليف</h3><p class="sh-sum">${dayLabel(d)} · ${summary(d)}</p><p class="muted">الزميل ${esc(d.toName)} استلمه بعد اعتذارك. أنت المكلّف الأول، ويوصل طلبك للمدير المساعد وهو يقرر.</p>
        <div class="sheet-btns"><button class="b-ok" data-x="go">إرسال الطلب</button><button class="b-ghost" data-x="close">رجوع</button></div>`, { go: () => true });
      if (!ok) return;
      const r = await askBack(d.id); SND(r ? 'send' : 'reject'); toast(r ? 'انرسل طلبك للإدارة' : 'تعذّر الإرسال');
      return;
    }
    if (w) {
      const d = mine.find(x => x.id === w.dataset.withdraw); if (!d) return;
      const why = await askExcuse(d, true); if (!why) return;
      SND('reject'); const ok = await refuse(d.id, why, 'withdrew');
      toast(ok ? 'انرفع اعتذارك للمدير المساعد' : 'تعذّر الإرسال');
    }
    if (b) {
      const d = refusedByMe.find(x => x.id === b.dataset.back); if (!d) return;
      const ok = await sheet(`<div class="sh-ic ok">↺</div><h3>الرجوع عن الاعتذار</h3><p class="sh-sum">${dayLabel(d)} · ${summary(d)}</p><p class="muted">التكليف يرجع لك كمُستلَم، ويوصل للإدارة والمشرف.</p>
        <div class="sheet-btns"><button class="b-ok" data-x="go">نعم، سأحضر</button><button class="b-ghost" data-x="close">رجوع</button></div>`, { go: () => true });
      if (!ok) return;
      const r = await comeBack(d.id, 'returned');
      if (!r) { const a = await askBack(d.id); SND(a ? 'send' : 'reject'); toast(a ? 'الزميل استلمه — انرسل طلب رجوعك للإدارة' : 'تعذّر الإرسال'); return; }
      SND('accept'); toast('رجع لك التكليف ✓ — شكرًا لك');
    }
  });

  // ---------- السحب ----------
  function bindTop() {
    const el = $('#stack .card.top'); if (!el || el._bound) return;
    el._bound = true;
    let x0 = 0, y0 = 0, dx = 0, on = false, started = false;
    const yes = el.querySelector('.stamp.yes'), no = el.querySelector('.stamp.no');
    el.onpointerdown = e => { on = true; started = false; x0 = e.clientX; y0 = e.clientY; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); };
    el.onpointermove = e => {
      if (!on) return;
      dx = e.clientX - x0; const dy = e.clientY - y0;
      if (!started && Math.abs(dx) > 8) { started = true; SND('swipe'); }
      el.style.transform = `translate(${dx}px, ${dy * .15}px) rotate(${dx / 18}deg)`;
      yes.style.opacity = Math.max(0, Math.min(1, dx / 110)); no.style.opacity = Math.max(0, Math.min(1, -dx / 110));
    };
    el.onpointerup = el.onpointercancel = () => {
      if (!on) return; on = false; el.classList.remove('drag');
      if (dx > 110) decide(el, 'yes'); else if (dx < -110) decide(el, 'no'); else back(el);
    };
  }
  function fly(el, dir) {
    el.classList.add('leaving');
    el.style.transition = 'transform .45s cubic-bezier(.3,.7,.3,1), opacity .45s';
    el.style.transform = `translate(${dir * 520}px, -40px) rotate(${dir * 28}deg)`; el.style.opacity = '0';
    setTimeout(() => el.remove(), 480);
  }
  function back(el) { el.style.transition = ''; el.style.transform = ''; el.querySelectorAll('.stamp').forEach(s => s.style.opacity = 0); }
  function lean(el, dir) { el.style.transform = `translateX(${dir * 70}px) rotate(${dir * 5}deg)`; el.querySelector(dir > 0 ? '.stamp.yes' : '.stamp.no').style.opacity = 1; }

  async function decide(el, what) {
    const d = mine.find(x => x.id === el.dataset.id); if (!d) return back(el);
    lean(el, what === 'yes' ? 1 : -1);
    if (what === 'yes') {
      if (!(await confirmAccept(d))) return back(el);
      SND('accept'); buzz(30); fly(el, 1);
      const ok = await accept(d.id);
      if (ok) snack('استلمت التكليف — وصل للإدارة والمشرف', () => undoAccept(d.id)); else toast('تعذّر الإرسال، حاول مرة ثانية');
      return;
    }
    const why = await askExcuse(d, false);
    if (!why) { back(el); toast('ممتاز — التكليف باقي لك'); return; }
    SND('reject'); buzz([20, 30, 20]); fly(el, -1);
    const ok = await refuse(d.id, why, 'rejected');
    if (ok) snack('انرفع اعتذارك للمدير المساعد', () => comeBack(d.id, 'undo').then(r => r && r.to === ME ? r : null)); else toast('تعذّر الإرسال، حاول مرة ثانية');
  }
  $('#btnYes').addEventListener('click', () => { const el = $('#stack .card.top'); if (el) decide(el, 'yes'); });
  $('#btnNo').addEventListener('click', () => { const el = $('#stack .card.top'); if (el) decide(el, 'no'); });

  // ---------- المشرف: المتابعة (بدون تفاصيل الاعتذار) ----------
  if (SUP) {
    $('#supLead').innerHTML = `صفوف إشرافك: <b>${esc(me.supLabel || '')}</b>`;
    S.watch('assign', ['sups', 'array-contains', ME], list => {
      supL = list.filter(d => d.date >= TODAY && d.status !== 'cancelled').sort(sortD);
      supL.filter(d => d.status === 'accepted').forEach(d => alertNew('s:' + d.id + ':' + d.to, 'تأكد التأمين — ' + d.slotName, `${short(d.toName)} في ${d.c || d.label}`));
      renderSup();
    });
  }
  function renderSup() {
    const L = supL;
    const n = { ok: L.filter(d => d.status === 'accepted' || d.status === 'emergency').length, wait: L.filter(d => d.status === 'pending').length, none: L.filter(d => !d.to && !d.emg).length };
    setNb('#nbSup', cur === 'sup' ? 0 : L.filter(d => d.status === 'accepted' && !seen.has('sv:' + d.id + ':' + d.to)).length);
    if (cur === 'sup') { L.forEach(d => seen.add('sv:' + d.id + ':' + d.to)); store.set(seenKey, JSON.stringify([...seen].slice(-300))); }
    $('#supSum').innerHTML = L.length ? `<span class="s-ok">${n.ok} مؤكد</span><span class="s-wait">${n.wait} بانتظار الاستلام</span>${n.none ? `<span class="s-bad">${n.none} تتابعه الإدارة</span>` : ''}` : '';
    let lastDay = '';
    $('#supList').innerHTML = L.map(d => {
      const head = d.date !== lastDay ? `<div class="day-h">${esc(dayLabel(d))} · ${esc(gDate(d.date))}</div>` : ''; lastDay = d.date;
      const [dot, who, tag] = d.status === 'accepted' ? ['ok', esc(d.toName), '<span class="tag ok">مؤكد ✓</span>']
        : d.to ? ['wait', esc(d.toName), d.auto ? '<span class="tag auto">بديل محوّل</span>' : '<span class="tag">بانتظار الاستلام</span>']
          : d.emg ? ['ok', '🛡 ' + esc(d.emg), '<span class="tag ok">الإدارة تؤمّن</span>'] : ['bad', 'الإدارة تتابع', ''];
      const what = d.kind === 'duty' ? '📍 ' + esc(d.label.replace('مراقبة — ', '')) : `${code(d.c)} · بدل ${esc(d.absentName)}`;
      return `${head}<div class="item"><span class="dot ${dot}"></span><div class="grow"><div class="t">${KIND[d.kind]} — ${esc(d.slotName)} <span class="tag" dir="ltr">${esc(d.time)}</span></div><div class="s">${what}</div><div class="s">المكلّف: <b class="ink">${who}</b> ${tag}</div></div></div>`;
    }).join('') || '<div class="empty"><div class="empty-ic">◉</div><b>ما فيه تأمين على صفوفك</b><p>أي تأمين أو مراقبة على صفوف إشرافك يطلع هنا مع حالته.</p></div>';
  }

  // ---------- الاستيضاح ----------
  if (TEACH) S.watch('explain', ['tid', '==', ME], list => {
    exps = list.sort((a, b) => b.sentAt - a.sentAt);
    exps.forEach(x => alertNew('e:' + x.id, 'استيضاح من الإدارة', x.reasonText));
    setNb('#nbExp', exps.filter(x => !x.reply).length);
    renderExp();
  });
  function renderExp() {
    $('#expList').innerHTML = exps.map(x => `<div class="exp ${x.reply ? '' : 'new'}">
      <h4>استيضاح: ${esc(x.reasonText)}</h4><div class="meta">${esc(fmtDay(x.sentAt))} · ${esc(fmtTime(x.sentAt))}${x.ref ? ' · ' + esc(x.ref) : ''}</div>
      <div class="letter">${esc(x.body)}</div>
      ${x.reply ? `<div class="meta">ردك (${esc(fmtDay(x.repliedAt))}):</div><div class="reply">${esc(x.reply)}</div>`
        : `<textarea rows="4" data-r="${x.id}" placeholder="اكتب ردك هنا… يوصل للمدير المساعد وينحفظ موثّق"></textarea><button class="btn" data-send="${x.id}">إرسال الرد</button>`}
    </div>`).join('') || '<div class="empty"><div class="empty-ic">✎</div><b>ما عندك استيضاحات</b></div>';
  }
  $('#expList').addEventListener('click', async e => {
    const b = e.target.closest('[data-send]'); if (!b) return;
    const t = $(`[data-r="${b.dataset.send}"]`).value.trim();
    if (!t) { toast('اكتب الرد أول'); return; }
    const ok = await sheet(`<h3>إرسال الرد</h3><p class="muted">الرد ينحفظ موثّقًا عند المدير المساعد، وما يمدي تعديله بعد الإرسال.</p>
      <div class="sheet-btns"><button class="b-ok" data-x="go">إرسال</button><button class="b-ghost" data-x="close">رجوع</button></div>`, { go: () => true });
    if (!ok) return;
    b.disabled = true;
    await S.tx('explain/' + b.dataset.send, c => c && !c.reply ? { ...c, reply: t, repliedAt: now(), seenA: false } : null);
    SND('send'); toast('انرسل ردك للمدير المساعد');
  });

  // ---------- المحادثة ----------
  S.watch('msgs', ['tid', '==', ME], list => {
    msgs = list.sort((a, b) => a.at - b.at);
    msgs.filter(m => m.from === 'admin').forEach(m => alertNew('m:' + m.id, 'رسالة من الإدارة', m.text.slice(0, 80)));
    setNb('#nbChat', msgs.filter(m => m.from === 'admin' && !m.readT).length);
    if (cur === 'chat') { renderChat(); markChatRead(); }
  });
  function renderChat() {
    const b = $('#chatBody');
    b.innerHTML = msgs.map(m => `<div class="bub ${m.from === 'teacher' ? 'me' : ''}">${esc(m.text)}<small>${esc(fmtTime(m.at))}</small></div>`).join('') || '<p class="muted" style="text-align:center">اكتب للإدارة أي استفسار.</p>';
    b.scrollTop = b.scrollHeight;
  }
  function markChatRead() { msgs.filter(m => m.from === 'admin' && !m.readT).forEach(m => S.set('msgs/' + m.id, { readT: true })); }
  $('#chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    const t = $('#chatText').value.trim(); if (!t) return;
    $('#chatText').value = ''; SND('send');
    await S.add('msgs', { tid: ME, name: me.name, from: 'teacher', role: ROLE, text: t, at: now(), readA: false, readT: true });
  });

  show(TEACH ? 'tasks' : 'sup');
  setTimeout(() => { firstLoad = false; }, 1500);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
