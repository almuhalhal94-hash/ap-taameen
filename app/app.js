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
  $('#roleTitle').textContent = ROLE === 'sup' ? 'متابعة المشرف' : ROLE === 'both' ? 'معلم ومشرف' : 'التأمين والتبديل';
  $('#tabSup').hidden = !SUP; $('#tabTasks').hidden = !TEACH; $('#tabExp').hidden = !TEACH;
  $('#meBtn').addEventListener('click', () => sheet(`<h3>${esc(me.name)}</h3><p class="muted">${ROLE === 'sup' ? 'دخلت برمز المشرف' : ROLE === 'both' ? 'دخلت كمعلم ومشرف' : 'دخلت برمز المعلم'}</p>
    <div class="sheet-btns"><button class="b-ghost" data-x="out">تسجيل الخروج</button><button class="b-ok" data-x="close">رجوع</button></div>`, { out: () => { store.del('apt-key'); location.reload(); } }));

  // ---------- التنقل ----------
  let cur = '', mine = [], refusedByMe = [], released = [], supL = [], exps = [], msgs = [], reqs = [];
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
      mine.filter(d => d.status === 'pending').forEach(d => alertNew('a:' + d.id + ':' + (d.log || []).length, `📋 تكليف جديد: ${KIND[d.kind]} — ${dayLabel(d)}`, d.kind === 'duty' ? `${d.slotName} (${d.time}) — ${d.label.replace('مراقبة — ', '')}` : `الحصة ${d.slotName} (${d.time})${d.c ? ' — صف ' + d.c : ''} — بدل ${d.absentName}. افتح التطبيق للاستلام.`));
      renderTasks();
    });
    S.watch('assign', ['released', 'array-contains', ME], list => {
      released = list.filter(d => d.date >= TODAY && d.status !== 'cancelled').sort(sortD);
      released.filter(d => d.to !== ME).forEach(d => alertNew('r:' + d.id + ':' + d.to, '✓ أعفتك الإدارة من تكليف', `${KIND[d.kind]} — الحصة ${d.slotName} ${dayLabel(d)}. ما تحتاج تحضرها، شكرًا لك.`));
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
      supL.filter(d => d.status === 'accepted').forEach(d => alertNew('s:' + d.id + ':' + d.to, `◉ تأكد التأمين — الحصة ${d.slotName} ${dayLabel(d)}`, `${d.toName} استلم ${d.kind === 'duty' ? d.label : 'صف ' + d.c}`));
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
    exps.forEach(x => alertNew('e:' + x.id, '✎ استيضاح من الإدارة', `${x.reasonText}${x.ref ? ' — ' + x.ref : ''}. مطلوب ردك من التطبيق.`));
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

  const PER = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة', 5: 'الخامسة', 6: 'السادسة', 7: 'السابعة' };
  const perName = s => PER[s] || s;
  // ---------- المحادثة ----------
  S.watch('msgs', ['tid', '==', ME], all => {
    const list = all.filter(m => !m.type);
    reqs = all.filter(m => (m.type === 'req' || m.type === 'absreq') && m.status !== 'cancelled').sort((a, b) => b.at - a.at);
    reqs.filter(q => q.status === 'approved').forEach(q => alertNew('q:' + q.id + ':ok', q.type === 'absreq' ? '✓ اعتمدت الإدارة طلب تأمين حصصك' : '✓ وافقت الإدارة على طلب التبديل', `${reqDay(q)} — ${(q.result || []).map(x => x.txt).join('، ') || 'تم الترتيب'}`));
    reqs.filter(q => q.status === 'declined').forEach(q => alertNew('q:' + q.id + ':no', q.type === 'absreq' ? 'طلب تأمين الحصص ما اعتُمد' : 'طلب التبديل ما اعتُمد', `${reqDay(q)}${q.adminNote ? ' — ' + q.adminNote : ''}`));
    renderReqs();
    msgs = list.sort((a, b) => a.at - b.at);
    msgs.filter(m => m.from === 'admin').forEach(m => alertNew('m:' + m.id, '✉ رسالة من الإدارة', m.text.slice(0, 120)));
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

  // ---------- طلب تبديل حصة ----------
  function reqDay(q) { return `${weekdayAr(q.date)} ${q.date.split('-').reverse().join('-')}`; }
  function weekdayAr(iso) { const [y, m, d] = iso.split('-').map(Number); return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(y, m - 1, d).getDay()]; }
  function renderReqs() {
    const ST = { pending: ['wait', 'بانتظار رد الإدارة'], approved: ['ok', 'تمت الموافقة ✓'], declined: ['bad', 'ما اعتُمد'] };
    $('#reqList').innerHTML = reqs.filter(q => q.date >= TODAY).map(q => {
      const st = ST[q.status] || ST.pending;
      const res = q.status === 'approved' && (q.result || []).length ? `<div class="s rq-res">${q.result.map(x => `<span class="${x.ok ? '' : 'rq-warn'}">${x.ok ? (q.type === 'absreq' ? '✓' : '⇄') : '⚠'} ${esc(x.txt)}</span>`).join('<br>')}</div>` : '';
      return `<div class="item rq rq-${st[0]}"><span class="dot ${st[0] === 'bad' ? 'bad' : ''}"></span><div class="grow"><div class="t">${q.type === 'absreq' ? 'طلب تأمين حصص (غياب بعذر رسمي)' : 'طلب تبديل'} — ${esc(reqDay(q))}</div>
        <div class="s">الحصص: ${q.full ? 'اليوم كامل' : q.slots.map(k => perName(k) + (q.cls && q.cls[k] ? ` (${code(q.cls[k])})` : '')).join('، ')} · ${q.type === 'absreq' ? 'العذر: ' + esc(q.kindTxt || '') + (q.reason ? ' — ' + esc(q.reason) : '') : 'السبب: ' + esc(q.reason)}</div>${res}${q.adminNote ? `<div class="s rq-note">الإدارة: ${esc(q.adminNote)}</div>` : ''}</div>
        <div class="side"><span class="tag ${st[0] === 'ok' ? 'ok' : ''}">${st[1]}</span>${q.status === 'pending' ? `<button class="mini" data-rq-cancel="${q.id}">إلغاء الطلب</button>` : ''}</div></div>`;
    }).join('');
  }
  $('#btnReq').addEventListener('click', async () => {
    SND('tap');
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    const def = tm.getDay() === 5 ? isoOf(new Date(tm.getTime() + 2 * 864e5)) : tm.getDay() === 6 ? isoOf(new Date(tm.getTime() + 864e5)) : isoOf(tm);
    const picked = new Set();
    const v = await sheet(`<div class="sh-ic">⇄</div><h3>طلب تبديل حصة</h3>
      <p class="sh-sum">اختر اليوم والحصص اللي تبي تبدّلها. الإدارة ترتّب لك زميلًا يدرّس <b>نفس الصف</b>: يدخل حصتك، وتدخل أنت حصته في وقت ثاني من نفس اليوم.</p>
      <p class="lbl">اليوم <span class="req">*</span></p><input type="date" id="rqDate" class="rq-in" min="${TODAY}" value="${def}"><p class="rq-sel" id="rqDay"></p>
      <p class="lbl">حصصك في هذا اليوم <span class="req">*</span> <small class="muted">— اضغط الحصة اللي تبي تبدّلها</small></p><div class="rq-per" id="rqPer"></div>
      <p class="rq-sel" id="rqSel">ما اخترت حصة بعد</p>
      <p class="lbl">السبب <span class="req">*</span></p><textarea id="rqWhy" rows="2" placeholder="مثال: موعد رسمي، ظرف عائلي…"></textarea>
      <p class="lbl">زميل تقترحه <small class="muted">(اختياري)</small></p><input id="rqWho" class="rq-in" placeholder="اسم الزميل إن اتفقت معه">
      <p class="err" id="rqErr"></p>
      <div class="sheet-btns"><button class="b-ok" data-x="go">إرسال الطلب للإدارة</button><button class="b-ghost" data-x="close">رجوع</button></div>`, {
      go: () => {
        const date = $('#rqDate').value, reason = $('#rqWhy').value.trim();
        const err = !date || date < TODAY ? 'اختر يومًا من اليوم فما بعد.' : !picked.size ? 'اختر حصة وحدة على الأقل.' : reason.length < 3 ? 'اكتب سبب الطلب.' : '';
        if (err) { $('#rqErr').textContent = err; buzz(30); return false; }
        const cls = {}; $('#rqPer').querySelectorAll('[data-p][data-c]').forEach(x => { if (picked.has(x.dataset.p)) cls[x.dataset.p] = x.dataset.c; });
        return { date, reason, slots: [...picked].sort(), cls, prefer: $('#rqWho').value.trim() };
      }
    }, () => {
      const dayTxt = () => { const v = $('#rqDate').value; $('#rqDay').innerHTML = v ? `يوم <b>${weekdayAr(v)}</b> ${new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(v + 'T12:00'))}` : ''; };
      // حصص المعلم الفعلية من الجدول العام لهذا اليوم
      const myT = ((window.TIMETABLE || {}).teachers || []).find(t => t.id === me.tid);
      const myDay = v => { if (!v) return null; const [y, m, d] = v.split('-').map(Number); const wd = new Date(y, m - 1, d).getDay(); if (wd > 4) return []; if (!myT) return null; if (myT.days && !myT.days.includes(wd)) return []; return Object.keys(PER).map(k => ({ k, c: myT.cells[wd + '-' + k] })).filter(x => x.c && x.c.t === 'حصة').map(x => ({ k: x.k, cls: x.c.c })); };
      const drawPer = () => {
        const L = myDay($('#rqDate').value);
        [...picked].forEach(k => { if (L && !L.some(x => x.k === k)) picked.delete(k); });
        $('#rqPer').innerHTML = L === null ? Object.entries(PER).map(([k, n]) => `<button type="button" data-p="${k}"><i class="n">${k}</i>${n}</button>`).join('')
          : L.length ? L.map(x => `<button type="button" data-p="${x.k}" data-c="${esc(x.cls)}"><i class="n">${x.k}</i>${PER[x.k]}<span class="cls">${code(x.cls)}</span></button>`).join('')
          : '<p class="rq-none">ما عندك حصص تدريس في هذا اليوم.</p>';
        paint();
      };
      $('#rqDate').oninput = $('#rqDate').onchange = () => { dayTxt(); drawPer(); }; dayTxt();
      let lastT = 0, lastP = '';
      const paint = () => {
        $('#rqPer').querySelectorAll('[data-p]').forEach(x => { const on = picked.has(x.dataset.p); x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        const l = [...picked].sort().map(perName);
        $('#rqSel').innerHTML = l.length ? `اخترت ${l.length === 1 ? 'حصة' : l.length === 2 ? 'حصتين' : l.length + ' حصص'}: <b>${l.join('، ')}</b>` : 'ما اخترت حصة بعد';
      };
      $('#rqPer').onclick = e => {
        const b = e.target.closest('[data-p]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        const t = Date.now(); if (b.dataset.p === lastP && t - lastT < 350) return; // ضغطة مكررة من اللمس
        lastT = t; lastP = b.dataset.p;
        SND('tap'); buzz(8);
        picked.has(b.dataset.p) ? picked.delete(b.dataset.p) : picked.add(b.dataset.p);
        b.blur(); paint(); $('#rqErr').textContent = '';
      };
      drawPer();
    });
    if (!v) return;
    await S.add('msgs', { type: 'req', tid: ME, name: me.name, from: 'teacher', ...v, status: 'pending', at: now(), readA: false, readT: true });
    SND('send'); buzz(20); toast('انرسل طلبك للمدير المساعد');
  });
  // ---------- طلب تأمين حصص: غياب بعذر رسمي (قبل بيوم أو أكثر) ----------
  const ABS_KINDS = ['موعد طبي رسمي', 'إجازة مرضية', 'مهمة عمل رسمية', 'دورة أو ورشة تدريبية', 'ظرف عائلي طارئ', 'إجازة رسمية معتمدة', 'عذر رسمي آخر'];
  const nextWork = (from, add) => { const d = new Date(from); d.setDate(d.getDate() + add); while (d.getDay() > 4) d.setDate(d.getDate() + 1); return isoOf(d); };
  $('#btnAbs').addEventListener('click', async () => {
    SND('tap');
    const MIN = nextWork(new Date(), 1), MAXD = new Date(); MAXD.setDate(MAXD.getDate() + 60); const MAX = isoOf(MAXD);
    const picked = new Set(); let kind = '';
    const myT = ((window.TIMETABLE || {}).teachers || []).find(t => t.id === me.tid);
    const wdOf = v => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
    const myDay = v => { if (!v) return []; const wd = wdOf(v); if (wd > 4 || !myT || (myT.days && !myT.days.includes(wd))) return []; return Object.keys(PER).map(k => ({ k, c: myT.cells[wd + '-' + k] })).filter(x => x.c && x.c.t === 'حصة').map(x => ({ k: x.k, cls: x.c.c })); };
    const v = await sheet(`<div class="sh-ic abs">✉</div><h3>طلب تأمين حصص</h3>
      <p class="sh-sum">في حال <b>غيابك عن العمل بعذر رسمي</b> معروف مسبقًا، قدّم الطلب <b>قبل موعد الغياب بيوم عمل على الأقل</b>، لتتمكّن الإدارة من توزيع حصصك على الزملاء وإبلاغهم في وقت مناسب.</p>
      <p class="lbl">يوم الغياب <span class="req">*</span></p><input type="date" id="abDate" class="rq-in" min="${MIN}" max="${MAX}" value="${MIN}"><p class="rq-sel" id="abDay"></p>
      <p class="lbl">نوع العذر <span class="req">*</span></p><div class="ab-kinds" id="abKinds">${ABS_KINDS.map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
      <p class="lbl">الحصص المطلوب تأمينها <span class="req">*</span> <small class="muted">— محدّدة كلها، اضغط لإلغاء ما لا يلزم</small></p><div class="rq-per" id="abPer"></div>
      <p class="rq-sel" id="abSel"></p>
      <p class="lbl">تفاصيل العذر <small class="muted">(اختياري)</small></p><textarea id="abWhy" rows="2" placeholder="مثال: موعد في المستشفى الساعة 9 صباحًا"></textarea>
      <label class="ab-pledge"><input type="checkbox" id="abOk"> <span>أتعهّد بتقديم ما يُثبت العذر الرسمي للإدارة.</span></label>
      <p class="err" id="abErr"></p>
      <div class="sheet-btns"><button class="b-ok" data-x="go">إرسال الطلب للإدارة</button><button class="b-ghost" data-x="close">رجوع</button></div>`, {
      go: () => {
        const date = $('#abDate').value, L = myDay(date);
        const err = !date ? 'اختر يوم الغياب.' : wdOf(date) > 4 ? 'هذا اليوم عطلة نهاية الأسبوع.' : date < MIN ? 'الطلب يُقدَّم قبل الغياب بيوم عمل على الأقل. للغياب اليوم تواصل مع الإدارة مباشرة.' : date > MAX ? 'اختر يومًا خلال الشهرين القادمين.' : wdOf(date) > 4 ? 'هذا اليوم عطلة نهاية الأسبوع.' : !L.length ? 'ما عندك حصص تدريس في هذا اليوم.' : !kind ? 'اختر نوع العذر.' : !picked.size ? 'اختر حصة وحدة على الأقل.' : !$('#abOk').checked ? 'أكّد التعهّد بتقديم ما يُثبت العذر.' : '';
        if (err) { $('#abErr').textContent = err; buzz(30); return false; }
        const cls = {}; L.forEach(x => { if (picked.has(x.k)) cls[x.k] = x.cls; });
        return { date, kindTxt: kind, reason: $('#abWhy').value.trim(), slots: [...picked].sort(), cls, full: picked.size === L.length };
      }
    }, () => {
      const draw = () => {
        const val = $('#abDate').value, L = myDay(val);
        $('#abDay').innerHTML = val ? `يوم <b>${weekdayAr(val)}</b> ${new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(val + 'T12:00'))}` : '';
        picked.clear(); L.forEach(x => picked.add(x.k));
        $('#abPer').innerHTML = L.length ? L.map(x => `<button type="button" data-p="${x.k}"><i class="n">${x.k}</i>${PER[x.k]}<span class="cls">${code(x.cls)}</span></button>`).join('') : `<p class="rq-none">${val && wdOf(val) > 4 ? 'هذا اليوم عطلة.' : 'ما عندك حصص تدريس في هذا اليوم.'}</p>`;
        paint();
      };
      const paint = () => {
        $('#abPer').querySelectorAll('[data-p]').forEach(x => { const on = picked.has(x.dataset.p); x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        const n = picked.size, all = myDay($('#abDate').value).length;
        $('#abSel').innerHTML = !all ? '' : n === all ? `<b>اليوم كامل</b> — ${n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n + ' حصص'}` : n ? `${n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n + ' حصص'}: <b>${[...picked].sort().map(perName).join('، ')}</b>` : 'ما اخترت حصة';
      };
      $('#abDate').oninput = $('#abDate').onchange = () => { $('#abErr').textContent = ''; draw(); };
      let lastT = 0, lastP = '';
      $('#abPer').onclick = e => {
        const b = e.target.closest('[data-p]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        const t = Date.now(); if (b.dataset.p === lastP && t - lastT < 350) return;
        lastT = t; lastP = b.dataset.p; SND('tap'); buzz(8);
        picked.has(b.dataset.p) ? picked.delete(b.dataset.p) : picked.add(b.dataset.p);
        b.blur(); paint(); $('#abErr').textContent = '';
      };
      $('#abKinds').onclick = e => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        e.preventDefault(); SND('tap'); kind = b.dataset.k;
        $('#abKinds').querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b)); $('#abErr').textContent = '';
      };
      draw();
    });
    if (!v) return;
    await S.add('msgs', { type: 'absreq', tid: ME, name: me.name, from: 'teacher', ...v, status: 'pending', at: now(), readA: false, readT: true });
    SND('send'); buzz(20); toast('انرسل طلب تأمين حصصك للإدارة');
  });
  $('#reqList').addEventListener('click', async e => {
    const c = e.target.closest('[data-rq-cancel]'); if (!c) return;
    await S.set('msgs/' + c.dataset.rqCancel, { status: 'cancelled' }); toast('أُلغي الطلب');
  });

  // الرمز الملغى (بعد تجديد الرموز) يطلّع المعلم لشاشة الدخول حتى لو التطبيق مفتوح — وانقطاع النت ما يطلّعه
  const recheck = async () => {
    const k = store.get('apt-key'); if (!k) return;
    let p; try { p = await S.get('people/' + k); } catch (e) { return; }
    if (p && p.revoked) { store.del('apt-key'); toast('تجدّد رمز الدخول — ادخل برمزك الجديد'); setTimeout(() => location.reload(), 1500); }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) recheck(); });
  setInterval(recheck, 5 * 60 * 1000);
  show(TEACH ? 'tasks' : 'sup');
  setTimeout(() => { firstLoad = false; }, 1500);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
