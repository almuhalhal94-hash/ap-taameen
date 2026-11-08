// تطبيق المعلم / المشرف — يشوف بس اللي يخصه، يقبل بالسحب يمين ويعتذر بالسحب يسار
(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ORDER = ['1', '2', 'B1', '3', 'B2', '4', '5', '6', '7'];
  const KIND = { cover: 'تأمين حصة', duty: 'مراقبة فسحة', swap: 'تبديل حصة' };
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const TODAY = isoOf(new Date());
  const fmtTime = ms => new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  const fmtDay = ms => new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));
  const dayLabel = d => d.date === TODAY ? 'اليوم' : `يوم ${d.day}`;
  const gDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d}-${m}-${y}`; };
  const now = () => Date.now();
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
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); };

  // ---------- الهوية من الرابط ----------
  const S = await window.Sync.ready;
  $('#demoNote').hidden = S.mode !== 'demo';
  const urlK = new URLSearchParams(location.search).get('k');
  if (urlK) { try { localStorage.setItem('apt-key', urlK); } catch (e) { } }
  const KEY = urlK || (() => { try { return localStorage.getItem('apt-key'); } catch (e) { return null; } })();
  const me = KEY ? await S.get('people/' + KEY).catch(() => null) : null;
  if (!me) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-bad'));
    $('#bar').hidden = true; $('#myName').textContent = '—';
    return;
  }
  const ME = me.tid;
  $('#myName').textContent = me.name;
  if (me.sup) $('#tabSup').hidden = false;

  // ---------- التنقل ----------
  function show(v) {
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'v-' + v));
    document.querySelectorAll('#bar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    cur = v;
    if (v === 'chat') { renderChat(); markChatRead(); }
    if (v === 'exp') renderExp();
  }
  let cur = 'tasks';
  $('#bar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { SND('tap'); show(b.dataset.v); } });
  const setNb = (id, n) => { const el = $(id); el.hidden = !n; el.textContent = n; };

  // ---------- التنبيهات ----------
  const canNotify = 'Notification' in window;
  if (canNotify && Notification.permission === 'default') $('#btnNotif').hidden = false;
  $('#btnNotif').addEventListener('click', async () => { try { await Notification.requestPermission(); } catch (e) { } $('#btnNotif').hidden = true; });
  const seenKey = 'apt-seen-' + ME;
  let seen = new Set(); try { seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch (e) { }
  let firstLoad = true;
  function alertNew(id, title, body) {
    if (seen.has(id)) return;
    seen.add(id); try { localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-300))); } catch (e) { }
    if (firstLoad) return;
    SND('notify'); buzz([60, 40, 60]);
    if (canNotify && Notification.permission === 'granted' && document.hidden) {
      navigator.serviceWorker && navigator.serviceWorker.ready
        ? navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, icon: 'icon-192.png', tag: id, lang: 'ar', dir: 'rtl' })).catch(() => new Notification(title, { body }))
        : new Notification(title, { body });
    }
  }

  // ---------- مهامي ----------
  let mine = [], refusedByMe = [];
  const sortD = (a, b) => a.date.localeCompare(b.date) || ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot);
  S.watch('assign', ['to', '==', ME], list => {
    mine = list.filter(d => d.date >= TODAY && d.status !== 'cancelled').sort(sortD);
    mine.filter(d => d.status === 'pending').forEach(d => alertNew('a:' + d.id + ':' + (d.log || []).length, KIND[d.kind] + ' — ' + d.slotName, `${dayLabel(d)} ${d.c || ''} بدل ${d.absentName}`));
    renderTasks();
  });
  S.watch('assign', ['refused', 'array-contains', ME], list => { refusedByMe = list.filter(d => d.date >= TODAY).sort(sortD); renderDone(); });

  function cardHTML(d) {
    const when = `<div class="when"><b>${esc(dayLabel(d))}</b> · ${esc(gDate(d.date))}</div>`;
    const per = `<div class="per">الحصة ${esc(d.slotName)}</div><span class="tm">${esc(d.time)}</span>`;
    let body = '';
    if (d.kind === 'duty') {
      body = `${when}<div class="per">${esc(d.slotName)}</div><span class="tm">${esc(d.time)}</span>
        <div class="post">📍 ${esc(d.label.replace('مراقبة — ', ''))}</div>`;
    } else if (d.kind === 'swap') {
      body = `${when}
        <div class="xch">
          <div><small>تدخل بدل ${esc(d.absentName)}</small><b>الحصة ${esc(d.slotName)}</b> · <span class="code" style="font-size:1rem;padding:1px 8px">${code(d.c)}</span> <span class="tm" style="font-size:.85rem">${esc(d.time)}</span></div>
          <div class="arr">⇅</div>
          <div><small>ويدخل عنك</small><b>حصتك ${esc(d.s2Name || '')}</b> <span class="tm" style="font-size:.85rem">${esc(d.s2Time || '')}</span></div>
        </div>`;
    } else {
      body = `${when}${per}
        <div class="cls"><span class="code">${code(d.c)}</span>${d.label && d.label !== 'حصة' ? `<span class="sub">${esc(d.label)}</span>` : ''}</div>`;
    }
    const forTxt = d.kind === 'swap' ? `طلب تبديل من <b>${esc(d.absentName)}</b>` : `بدل <b>${esc(d.absentName)}</b> ${d.out ? '(مستأذن)' : '(غائب)'}`;
    return `<span class="kind">${KIND[d.kind]}</span>${body}
      <div class="for">${forTxt}${d.auto ? '<span class="auto">تكليف جديد</span>' : ''}</div>
      <div class="stamp yes">قبول ✓</div><div class="stamp no">اعتذار</div>`;
  }

  let shown = [];
  function renderTasks() {
    const pend = mine.filter(d => d.status === 'pending');
    setNb('#nbTasks', pend.length);
    const stack = $('#stack');
    const ids = pend.slice(0, 3).map(d => d.id);
    // نحافظ على البطاقات الموجودة عشان الحركة ما تنقطع
    [...stack.children].forEach(el => { if (!ids.includes(el.dataset.id) && !el.classList.contains('leaving')) el.remove(); });
    ids.slice().reverse().forEach((id, ri) => {
      const i = ids.length - 1 - ri, d = pend[i];
      let el = stack.querySelector(`[data-id="${CSS.escape(id)}"]:not(.leaving)`);
      if (!el) { el = document.createElement('div'); el.dataset.id = id; el.className = 'card enter'; el.innerHTML = cardHTML(d); stack.appendChild(el); setTimeout(() => el.classList.remove('enter'), 600); }
      el.className = el.className.replace(/\b(top|back1|back2|k-\w+)\b/g, '').trim() + ` k-${d.kind} ` + (i === 0 ? 'top' : i === 1 ? 'back1' : 'back2');
      el.style.zIndex = 3 - i;
    });
    const has = pend.length > 0;
    $('#emptyTasks').hidden = has; $('#acts').hidden = !has; $('#swipeHint').hidden = !has;
    $('.stack').style.height = has ? '' : '0';
    bindTop();
    renderDone();
  }
  function renderDone() {
    const acc = mine.filter(d => d.status === 'accepted');
    const rows = [
      ...acc.map(d => `<div class="item"><span class="dot ok"></span><div><div class="t">${KIND[d.kind]} — ${esc(d.slotName)} ${d.c ? `<span class="tag">${code(d.c)}</span>` : ''}</div><div class="s">${esc(dayLabel(d))} · ${esc(d.time)} · ${d.kind === 'duty' ? esc(d.label.replace('مراقبة — ', '')) : 'بدل ' + esc(d.absentName)}</div></div><span class="r">قبلت ✓</span></div>`),
      ...refusedByMe.map(d => `<div class="item"><span class="dot bad"></span><div><div class="t">${KIND[d.kind]} — ${esc(d.slotName)}</div><div class="s">${esc(dayLabel(d))} · بدل ${esc(d.absentName)}</div></div><span class="r">اعتذرت</span></div>`)
    ];
    $('#doneList').innerHTML = rows.join('') || '<p class="muted" style="font-size:.85rem">ما فيه شي بعد.</p>';
  }

  // ---------- السحب ----------
  function bindTop() {
    const el = $('#stack .card.top'); if (!el || el._bound) return;
    el._bound = true;
    let x0 = 0, y0 = 0, dx = 0, on = false, started = false;
    const yes = el.querySelector('.stamp.yes'), no = el.querySelector('.stamp.no');
    el.addEventListener('pointerdown', e => { on = true; started = false; x0 = e.clientX; y0 = e.clientY; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
    el.addEventListener('pointermove', e => {
      if (!on) return;
      dx = e.clientX - x0; const dy = e.clientY - y0;
      if (!started && Math.abs(dx) > 8) { started = true; SND('swipe'); }
      el.style.transform = `translate(${dx}px, ${dy * .15}px) rotate(${dx / 18}deg)`;
      yes.style.opacity = Math.max(0, Math.min(1, dx / 110));
      no.style.opacity = Math.max(0, Math.min(1, -dx / 110));
    });
    const end = () => {
      if (!on) return; on = false; el.classList.remove('drag');
      if (dx > 110) decide(el, 'yes');
      else if (dx < -110) decide(el, 'no');
      else { el.style.transform = ''; yes.style.opacity = no.style.opacity = 0; }
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function fly(el, dir) {
    el.classList.add('leaving');
    el.style.transition = 'transform .45s cubic-bezier(.3,.7,.3,1), opacity .45s';
    el.style.transform = `translate(${dir * 520}px, -40px) rotate(${dir * 28}deg)`; el.style.opacity = '0';
    setTimeout(() => el.remove(), 480);
  }
  function back(el) { el.style.transform = ''; el.querySelectorAll('.stamp').forEach(s => s.style.opacity = 0); }

  async function decide(el, what) {
    const d = mine.find(x => x.id === el.dataset.id); if (!d) return;
    if (what === 'yes') {
      SND('accept'); buzz(30); fly(el, 1);
      const ok = await S.tx('assign/' + d.id, c => {
        if (!c || c.to !== ME || c.status !== 'pending') return null;
        return { ...c, status: 'accepted', log: [...(c.log || []), { tid: ME, name: me.name, act: 'accepted', at: now() }], updatedAt: now() };
      }).catch(() => null);
      toast(ok ? 'تم القبول — وصل للإدارة والمشرف' : 'تعذّر الإرسال، حاول مرة ثانية');
      return;
    }
    // الاعتذار: السبب اختياري ويوصل للإداري فقط
    const why = await askWhy();
    if (why === null) { back(el); return; }
    SND('reject'); buzz([20, 30, 20]); fly(el, -1);
    const ok = await S.tx('assign/' + d.id, c => {
      if (!c || c.to !== ME || c.status === 'cancelled') return null;
      const refused = [...new Set([...(c.refused || []), ME])];
      const n = { ...c, refused, log: [...(c.log || []), { tid: ME, name: me.name, act: 'rejected', at: now(), note: why }], updatedAt: now(), auto: true };
      const next = (c.backups || []).find(b => !refused.includes(typeof b === 'string' ? b : b.b));
      if (next) {
        const id = typeof next === 'string' ? next : next.b;
        Object.assign(n, { to: id, toName: (c.names || {})[id] || '', status: 'pending' });
        if (c.kind === 'swap') Object.assign(n, { s2: next.s2, s2Name: next.s2Name || '', s2Time: next.s2Time || '', t2: next.t2 || '' });
      } else Object.assign(n, { to: '', toName: '', status: 'none' });
      return n;
    }).catch(() => null);
    toast(ok ? 'تم الاعتذار — وصل للمدير المساعد' : 'تعذّر الإرسال، حاول مرة ثانية');
  }
  $('#btnYes').addEventListener('click', () => { const el = $('#stack .card.top'); if (el) { el.style.transform = 'translateX(30px) rotate(3deg)'; el.querySelector('.stamp.yes').style.opacity = 1; setTimeout(() => decide(el, 'yes'), 160); } });
  $('#btnNo').addEventListener('click', () => { const el = $('#stack .card.top'); if (el) { el.style.transform = 'translateX(-30px) rotate(-3deg)'; el.querySelector('.stamp.no').style.opacity = 1; setTimeout(() => decide(el, 'no'), 160); } });

  function askWhy() {
    return new Promise(res => {
      const sh = $('#sheet'), chips = $('#whyChips');
      chips.querySelectorAll('button').forEach(b => b.classList.remove('on')); $('#whyText').value = '';
      sh.hidden = false;
      chips.onclick = e => { const b = e.target.closest('button'); if (!b) return; SND('tap'); const on = !b.classList.contains('on'); chips.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.toggle('on', on); };
      const done = v => { sh.hidden = true; $('#sheetSend').onclick = $('#sheetBack').onclick = sh.onclick = null; res(v); };
      $('#sheetSend').onclick = () => { const c = chips.querySelector('.on'); const t = $('#whyText').value.trim(); done([c ? c.textContent : '', t].filter(Boolean).join(' — ')); };
      $('#sheetBack').onclick = () => done(null);
      sh.onclick = e => { if (e.target === sh) done(null); };
    });
  }

  // ---------- المشرف: القبولات والبديل التلقائي (بدون تفاصيل الاعتذار) ----------
  if (me.sup) {
    $('#supLead').textContent = `صفوف إشرافك: ${me.supLabel || ''}. تطلع لك الحصص اللي تأكد تأمينها، ولو تغيّر المؤمّن يطلع لك البديل مباشرة.`;
    S.watch('assign', ['sups', 'array-contains', ME], list => {
      const L = list.filter(d => d.date >= TODAY && d.status !== 'cancelled').sort(sortD);
      L.filter(d => d.status === 'accepted').forEach(d => alertNew('s:' + d.id + ':' + d.to, 'تأكيد تأمين — ' + d.slotName, `${d.toName} في ${d.c || d.label}`));
      setNb('#nbSup', L.filter(d => d.status === 'accepted' && !seen.has('sv:' + d.id + ':' + d.to)).length);
      let lastDay = '';
      $('#supList').innerHTML = L.map(d => {
        const head = d.date !== lastDay ? `<div class="day-h">${esc(dayLabel(d))} · ${esc(gDate(d.date))}</div>` : ''; lastDay = d.date;
        const [dot, who, tag] = d.status === 'accepted' ? ['ok', esc(d.toName), '<span class="tag ok">مؤكد</span>']
          : d.to ? ['wait', esc(d.toName), d.auto ? '<span class="tag auto">بديل تلقائي</span>' : '<span class="tag">بانتظار رده</span>']
            : d.emg ? ['wait', esc(d.emg), '<span class="tag">طوارئ</span>'] : ['bad', 'الإدارة تتابع', ''];
        const what = d.kind === 'duty' ? esc(d.label.replace('مراقبة — ', '')) : `${code(d.c)} — بدل ${esc(d.absentName)}`;
        return `${head}<div class="item"><span class="dot ${dot}"></span><div><div class="t">${esc(d.slotName)} <span class="tag" dir="ltr">${esc(d.time)}</span></div><div class="s">${what}</div><div class="s">المؤمّن: <b style="color:var(--ink)">${who}</b> ${tag}</div></div></div>`;
      }).join('') || '<p class="muted">ما فيه تأمين على صفوفك.</p>';
      if (cur === 'sup') L.forEach(d => seen.add('sv:' + d.id + ':' + d.to));
    });
  }

  // ---------- الاستيضاح ----------
  let exps = [];
  S.watch('explain', ['tid', '==', ME], list => {
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
    b.disabled = true;
    await S.tx('explain/' + b.dataset.send, c => c && !c.reply ? { ...c, reply: t, repliedAt: now(), seenA: false } : null);
    SND('send'); toast('انرسل ردك للمدير المساعد');
  });

  // ---------- المحادثة ----------
  let msgs = [];
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
    await S.add('msgs', { tid: ME, name: me.name, from: 'teacher', text: t, at: now(), readA: false, readT: true });
  });

  setTimeout(() => { firstLoad = false; }, 1500);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
