// الإداري: إرسال التأمين والتبديل لجوالات المعلمين، ومتابعة الردود، والاستيضاح، والمحادثات
(async () => {
  'use strict';
  const A = window.APT;
  if (!A || !window.Sync) return;
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  const S = await window.Sync.ready;
  const DEMO = S.mode === 'demo';
  let docs = [], exps = [], msgs = [];
  const ORDER = ['1', '2', 'B1', '3', 'B2', '4', '5', '6', '7'];
  const now = () => Date.now();
  const KIND = { cover: 'تأمين حصة', duty: 'مراقبة فسحة', swap: 'تبديل' };
  const STATUS = { pending: 'بانتظار الرد', accepted: 'قبل', emergency: 'طوارئ', none: 'بدون مؤمّن', cancelled: 'ملغي' };
  const code = c => c ? c.split(' / ').map(x => `<span class="code">${[...x].map(ch => `<i>${esc(ch)}</i>`).join('')}</span>`).join(' / ') : '';
  const tName = id => A.isE(id) ? id.slice(2) : (A.byId[id] ? A.byId[id].name : id);
  const fmtTime = ms => new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'numeric' }).format(new Date(ms));

  $('#syncNote').textContent = DEMO
    ? 'وضع التجربة: الردود تنحفظ في هذا المتصفح فقط (افتح رابط المعلم في تبويب ثاني وجرّب). لما نربط Firebase يشتغل بين كل الجوالات.'
    : '● متصل — الردود توصل مباشرة من جوالات المعلمين.';

  // ---------------- اللي لازم ينرسل لليوم ----------------
  const sups = (c, slot) => Object.keys(A.settings.supervise || {}).filter(id => A.supOf(id).length && A.supAllows(id, c, slot));
  function desired() {
    const st = A.state, iso = A.date, list = [];
    const day = A.weekdayName(iso);
    for (const r of st.rows) {
      const kind = r.slot.startsWith('B') ? 'duty' : 'cover';
      const to = r.sub && !A.isE(r.sub) ? r.sub : '';
      const backups = A.ranked(r).filter(x => x !== to).slice(0, 8);
      const sp = A.slotPlain(r.slot, r.c);
      list.push({
        id: `${iso}_${kind}_${r.absent}_${r.slot}`,
        info: { date: iso, day, kind, absent: r.absent, absentName: tName(r.absent), out: r.kind === 'out', slot: r.slot, slotName: sp.name, time: sp.time, c: r.c || '', label: r.t || '' },
        to, emg: A.isE(r.sub) ? r.sub.slice(2) : '', backups, sups: sups(r.c, r.slot)
      });
    }
    for (const sw of st.swaps) {
      if (st.absent[sw.a]) continue;
      for (const it of sw.items) {
        if (!it.b) continue;
        const sp = A.slotPlain(it.s, it.c), sp2 = A.slotPlain(it.s2, it.c);
        const backups = A.swapRanked(sw, it).filter(o => o.b !== it.b).slice(0, 8).map(o => { const p = A.slotPlain(o.s2, it.c); return { ...o, s2Name: p.name, s2Time: p.time }; });
        list.push({
          id: `${iso}_swap_${sw.a}_${it.s}`,
          info: { date: iso, day, kind: 'swap', absent: sw.a, absentName: tName(sw.a), slot: it.s, slotName: sp.name, time: sp.time, c: it.c || '', label: it.t || '', s2: it.s2, s2Name: sp2.name, s2Time: sp2.time, t2: it.t2 || '' },
          to: it.b, emg: '', backups, sups: sups(it.c, it.s)
        });
      }
    }
    return list;
  }
  const namesOf = w => {
    const ids = [w.to, ...w.backups.map(x => typeof x === 'string' ? x : x.b)].filter(Boolean);
    return Object.fromEntries(ids.map(id => [id, tName(id)]));
  };

  function merged(cur, w) {
    const base = { ...w.info, backups: w.backups, sups: w.sups };
    const statusFor = to => to ? 'pending' : (w.emg ? 'emergency' : 'none');
    if (!cur) return { ...base, to: w.to, toName: w.to ? tName(w.to) : '', emg: w.emg, status: statusFor(w.to), auto: false, refused: [], log: [], names: namesOf(w), createdAt: now(), updatedAt: now() };
    const n = { ...cur, ...base, names: { ...(cur.names || {}), ...namesOf(w) } };
    if (cur.status === 'cancelled' || cur.to !== w.to || (!w.to && cur.emg !== w.emg)) {
      if (cur.to && cur.to !== w.to && cur.status !== 'cancelled') n.log = [...(cur.log || []), { tid: cur.to, name: cur.toName, act: 'reassigned', at: now() }];
      Object.assign(n, { to: w.to, toName: w.to ? tName(w.to) : '', emg: w.emg, status: statusFor(w.to), auto: false });
    }
    const strip = x => { const { updatedAt, ...r } = x; return JSON.stringify(r); };
    if (strip(n) === strip(cur)) return null;
    n.updatedAt = now();
    return n;
  }

  let busy = false, again = false;
  const sentDays = () => (A.settings.sentDays = A.settings.sentDays || {});
  async function publish(manual) {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const iso = A.date, want = desired(), ids = new Set(want.map(w => w.id));
      if (manual && !want.length) { A.toast('ما فيه تأمين أو تبديل لهذا اليوم'); return; }
      for (const w of want) await S.tx('assign/' + w.id, cur => merged(cur, w));
      for (const d of docs) if (d.date === iso && !ids.has(d.id) && d.status !== 'cancelled') await S.set('assign/' + d.id, { status: 'cancelled', updatedAt: now() });
      if (!sentDays()[iso]) { sentDays()[iso] = true; A.saveSettings(); }
      if (manual) A.toast(`انرسل لـ ${new Set(want.map(w => w.to).filter(Boolean)).size} معلم`);
    } catch (e) { console.warn(e); A.toast('تعذّر الإرسال — تأكد من الاتصال'); }
    finally { busy = false; if (again) { again = false; publish(false); } }
    renderSend();
  }
  $('#btnSend').addEventListener('click', () => publish(true));

  // بعد أول إرسال لليوم: أي تعديل على التأمين يوصل تلقائي
  let tmr;
  document.addEventListener('apt:day', () => {
    watchDay();
    renderSend();
    if (sentDays()[A.date]) { clearTimeout(tmr); tmr = setTimeout(() => publish(false), 600); }
  });

  // ---------------- متابعة ردود اليوم ----------------
  let unDay = null, dayW = '';
  function watchDay() {
    if (dayW === A.date) return;
    dayW = A.date;
    if (unDay) unDay();
    unDay = S.watch('assign', ['date', '==', A.date], list => { docs = list; onDocs(); });
  }
  function lockPublished() {
    const st = A.state;
    for (const d of docs) {
      if (d.status === 'cancelled') continue;
      if (d.kind === 'swap') {
        const sw = st.swaps.find(x => x.a === d.absent), it = sw && sw.items.find(x => x.s === d.slot);
        if (it && it.b) it.m = true;
      } else {
        const r = st.rows.find(x => x.absent === d.absent && x.slot === d.slot);
        if (r && r.sub) r.m = true;
      }
    }
  }
  function onDocs() {
    if (docs.length && docs[0].date === A.date) {
      lockPublished();   // اللي انرسل ما يتغيّر صاحبه إذا انعاد التوزيع
      for (const d of docs) {
        if (d.status === 'cancelled' || !(d.refused || []).length) continue;
        const next = d.kind === 'swap' ? (d.to ? { b: d.to, s2: d.s2, t2: d.t2 } : null) : (d.to || null);
        A.applyRefusal(d.date, { kind: d.kind, absent: d.absent, slot: d.slot }, d.refused, next);
      }
    }
    renderResp(); badge();
  }

  function renderSend() {
    const iso = A.date, n = desired().length, sent = !!sentDays()[iso];
    $('#respDay').textContent = `${A.weekdayName(iso)} ${A.fmtG(iso)}`;
    $('#btnSend').textContent = sent ? 'إعادة الإرسال' : 'إرسال تأمين اليوم للمعلمين';
    $('#sendNote').textContent = !n ? 'ما فيه تأمين أو تبديل لهذا اليوم. اختر الغائبين من «تأمين اليوم».'
      : sent ? `انرسل. أي تعديل على التأمين يوصل للمعلمين تلقائيًا، ولو اعتذر أحد يتحوّل للبديل اللي بعده.`
        : `${n} مهمة جاهزة للإرسال.`;
  }

  let filt = 'all';
  $('#respFilter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filt = b.dataset.f; document.querySelectorAll('#respFilter button').forEach(x => x.classList.toggle('on', x === b)); renderResp();
  });
  function renderResp() {
    const list = docs.filter(d => d.date === A.date && d.status !== 'cancelled')
      .filter(d => filt === 'all' || (filt === 'refused' ? (d.refused || []).length : d.status === filt))
      .sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot) || a.absentName.localeCompare(b.absentName, 'ar'));
    if (!list.length) { $('#respList').innerHTML = `<p class="muted">${docs.length ? 'لا يوجد في هذا التصنيف.' : 'ما انرسل شي لهذا اليوم بعد.'}</p>`; return; }
    $('#respList').innerHTML = list.map(d => {
      const ref = (d.refused || []).map(id => `<span class="who bad">${esc((d.names || {})[id] || tName(id))} <button class="link" data-exp="${d.id}" data-t="${id}" data-r="${d.kind === 'swap' ? 'swap' : 'refuse'}">استيضاح</button></span>`).join('');
      const notes = (d.log || []).filter(l => l.act === 'rejected' && l.note).map(l => `<div class="rnote">«${esc(l.note)}» — ${esc(l.name)}</div>`).join('');
      const who = d.to ? esc(d.toName) : d.emg ? `${esc(d.emg)} <small>(طوارئ)</small>` : '<span class="muted">بدون مؤمّن</span>';
      const st = d.to ? `<span class="st ${d.status}">${d.status === 'accepted' ? '✓ قبل' : 'بانتظار الرد'}</span>` : '';
      const what = d.kind === 'swap'
        ? `يأخذ حصة ${esc(d.absentName)} <b>${esc(d.slotName)}</b> ${code(d.c)}، و${esc(d.absentName)} يأخذ حصته <b>${esc(d.s2Name || '')}</b>`
        : `${d.out ? 'مستأذن' : 'غائب'}: ${esc(d.absentName)} ${d.label && d.label !== 'حصة' ? '— ' + esc(d.label) : ''}${d.c ? ` · ${code(d.c)}` : ''}`;
      return `<div class="resp ${d.status}">
        <div class="rt"><span class="kind k-${d.kind}">${KIND[d.kind]}</span><b>${esc(d.slotName)}</b> <small dir="ltr">${esc(d.time)}</small></div>
        <div class="rw">${what}</div>
        <div class="rto">المكلّف: <b>${who}</b> ${st} ${d.auto ? '<span class="st auto">بديل تلقائي</span>' : ''}
          ${d.to ? `<button class="link" data-exp="${d.id}" data-t="${d.to}" data-r="${d.kind === 'duty' ? 'duty' : d.kind === 'swap' ? 'swapabs' : 'cover'}">استيضاح عدم حضور</button>` : ''}</div>
        ${ref ? `<div class="rref">اعتذر: ${ref}</div>${notes}` : ''}
      </div>`;
    }).join('');
  }
  $('#respList').addEventListener('click', e => {
    const b = e.target.closest('[data-exp]'); if (!b) return;
    const d = docs.find(x => x.id === b.dataset.exp); if (!d) return;
    const r = b.dataset.r;
    const reason = r === 'refuse' ? 'other' : r === 'swapabs' ? 'cover' : r;
    const refTxt = `يوم ${d.day} ${A.fmtG(d.date)}، ${d.kind === 'duty' ? d.label.replace('مراقبة — ', 'مراقبة ') + ' في ' + d.slotName : 'الحصة ' + d.slotName + (d.c ? ' (' + d.c + ')' : '')}`;
    openExp(b.dataset.t, reason, refTxt, r === 'refuse' ? 'اعتذاركم عن حصة التأمين المكلّفين بها' : '', d.id);
  });

  // ---------------- الاستيضاح ----------------
  const REASON = { cover: 'عدم حضور حصة التأمين', duty: 'عدم الحضور لمراقبة الفسحة', swap: 'رفض التبديل', other: 'أخرى' };
  const REASON_TXT = { cover: 'عدم حضوركم حصة التأمين المكلّفين بها', duty: 'عدم حضوركم لمراقبة الفسحة المكلّفين بها', swap: 'اعتذاركم عن التبديل المطلوب منكم', other: '' };
  const bodyOf = (tid, reason, ref, custom) => {
    const why = custom || REASON_TXT[reason];
    return `المكرّم الأستاذ/ ${tName(tid).replace(/^أ\.\s*/, '')} المحترم\nالسلام عليكم ورحمة الله وبركاته، وبعد:\n\n${why ? `نظرًا لـ${why}${ref ? ' ' + ref : ''}، ` : ''}نأمل منكم التكرّم بإيضاح الأسباب كتابيًا من خلال هذا التطبيق.\n\nشاكرين لكم حسن تعاونكم.`;
  };
  $('#expTeacher').innerHTML = [...A.T].sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  let expRefDoc = '', expCustom = '';
  function openExp(tid, reason = 'cover', ref = '', custom = '', docId = '') {
    expRefDoc = docId; expCustom = custom;
    $('#expTeacher').value = tid || $('#expTeacher').value;
    $('#expReason').value = reason; $('#expRef').value = ref;
    $('#expBody').value = bodyOf($('#expTeacher').value, reason, ref, custom);
    $('#expModal').hidden = false;
  }
  const refreshBody = () => { $('#expBody').value = bodyOf($('#expTeacher').value, $('#expReason').value, $('#expRef').value.trim(), expCustom); };
  $('#expTeacher').addEventListener('change', refreshBody);
  $('#expReason').addEventListener('change', () => { expCustom = ''; refreshBody(); });
  $('#expRef').addEventListener('input', refreshBody);
  $('#btnNewExp').addEventListener('click', () => openExp('', 'cover', `يوم ${A.weekdayName(A.date)} ${A.fmtG(A.date)}، الحصة `));
  $('#expCancel').addEventListener('click', () => { $('#expModal').hidden = true; });
  $('#expSend').addEventListener('click', async () => {
    const tid = $('#expTeacher').value, body = $('#expBody').value.trim();
    if (!body) return;
    const reason = $('#expReason').value;
    await S.add('explain', { tid, name: tName(tid), reason, reasonText: expCustom ? 'الاعتذار عن التأمين' : REASON[reason], ref: $('#expRef').value.trim(), body, doc: expRefDoc, sentAt: now(), reply: '', repliedAt: 0, seenA: true });
    $('#expModal').hidden = true; A.toast('انرسل الاستيضاح للمعلم');
  });

  S.watch('explain', null, list => { exps = list.sort((a, b) => b.sentAt - a.sentAt); renderExp(); badge(); });
  function renderExp() {
    $('#expList').innerHTML = exps.length ? exps.map(x => `<div class="exp ${x.reply ? 'done' : ''} ${x.reply && !x.seenA ? 'new' : ''}">
        <div class="et"><b>${esc(x.name)}</b> — ${esc(x.reasonText)} <small>${fmtTime(x.sentAt)}</small></div>
        ${x.ref ? `<div class="er">${esc(x.ref)}</div>` : ''}
        ${x.reply ? `<div class="ereply"><span>رد المعلم (${fmtTime(x.repliedAt)}):</span> ${esc(x.reply)}</div>` : '<div class="muted">بانتظار رد المعلم</div>'}
        <div class="btn-row"><button class="btn sm" data-print="${x.id}">طباعة</button>${x.reply && !x.seenA ? `<button class="btn sm" data-seen="${x.id}">تمت القراءة</button>` : ''}</div>
      </div>`).join('') : '<p class="muted">ما فيه استيضاحات.</p>';
  }
  $('#expList').addEventListener('click', e => {
    const p = e.target.closest('[data-print]'), s = e.target.closest('[data-seen]');
    if (s) S.set('explain/' + s.dataset.seen, { seenA: true });
    if (p) printExp(exps.find(x => x.id === p.dataset.print));
  });
  function printExp(x) {
    if (!x) return;
    const st = A.settings, d = new Date(x.sentAt), iso = A.isoOf(d);
    const lines = s => esc(s).replace(/\n/g, '<br>');
    $('#printSheet').innerHTML = `
      <div class="ps-head"><img src="assets/header.jpg" alt=""></div>
      <h1 class="ps-title">استيضاح</h1>
      <div class="ps-meta"><span>التاريخ: <b>${esc(A.fmtG(iso))}</b></span><span>الموافق: <b>${esc(A.fmtH(iso))}</b></span></div>
      <table class="ps-table"><tbody>
        <tr><th style="width:22%">اسم المعلم</th><td class="nm">${esc(x.name)}</td></tr>
        <tr><th>الموضوع</th><td class="nm">${esc(x.reasonText)}</td></tr>
        ${x.ref ? `<tr><th>التفاصيل</th><td class="nm">${esc(x.ref)}</td></tr>` : ''}
      </tbody></table>
      <div class="ps-letter">${lines(x.body)}</div>
      <h2 class="ps-sub">رد المعلم</h2>
      <div class="ps-reply">${x.reply ? lines(x.reply) : '<span style="color:#777">لم يرد المعلم بعد.</span>'}</div>
      ${x.reply ? `<p class="ps-note">تاريخ الرد: ${esc(fmtTime(x.repliedAt))} — مرسل من تطبيق التأمين.</p>` : ''}
      <div class="ps-foot three">
        <div><div class="role">المعلم</div><div class="pname">${esc(x.name)}</div><div class="sigline">التوقيع</div></div>
        <div><div class="role">المدير المساعد</div><div class="pname">${esc(st.assistant)}</div><div class="sigline">التوقيع</div></div>
        <div><div class="role">مدير المدرسة</div><div class="pname">${esc(st.principal)}</div><div class="sigline">التوقيع</div></div>
      </div>`;
    const old = document.title; document.title = `استيضاح — ${x.name}`;
    const img = $('#printSheet img');
    const go = () => { window.print(); document.title = old; };
    if (img.complete) go(); else img.onload = img.onerror = go;
  }

  // ---------------- المحادثات ----------------
  let openT = '';
  S.watch('msgs', null, list => { msgs = list.sort((a, b) => a.at - b.at); renderPeople(); renderThread(); badge(); });
  function renderPeople() {
    const last = {}, un = {};
    msgs.forEach(m => { last[m.tid] = m; if (m.from === 'teacher' && !m.readA) un[m.tid] = (un[m.tid] || 0) + 1; });
    const withMsg = Object.keys(last).sort((a, b) => last[b].at - last[a].at);
    const rest = [...A.T].filter(t => !last[t.id]).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    $('#chatPeople').innerHTML = withMsg.map(id => `<button class="cp ${id === openT ? 'on' : ''}" data-cp="${id}"><b>${esc(tName(id))}</b>${un[id] ? `<span class="nbadge">${un[id]}</span>` : ''}<small>${esc(last[id].text.slice(0, 40))}</small></button>`).join('')
      + `<select id="chatNew"><option value="">+ محادثة جديدة…</option>${rest.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>`;
  }
  function renderThread() {
    if (!openT) return;
    const th = msgs.filter(m => m.tid === openT);
    $('#chatThread').innerHTML = `<div class="ch-h">${esc(tName(openT))}</div>
      <div class="ch-body">${th.map(m => `<div class="bub ${m.from === 'admin' ? 'me' : ''}">${esc(m.text)}<small>${fmtTime(m.at)}</small></div>`).join('') || '<p class="muted">ابدأ المحادثة.</p>'}</div>
      <form class="ch-in" id="chatForm"><input id="chatText" placeholder="اكتب رسالة…" autocomplete="off"><button class="btn primary">إرسال</button></form>`;
    const b = $('#chatThread .ch-body'); b.scrollTop = b.scrollHeight;
    th.filter(m => m.from === 'teacher' && !m.readA).forEach(m => S.set('msgs/' + m.id, { readA: true }));
  }
  $('#chatPeople').addEventListener('click', e => { const b = e.target.closest('[data-cp]'); if (b) { openT = b.dataset.cp; renderPeople(); renderThread(); } });
  $('#chatPeople').addEventListener('change', e => { if (e.target.id === 'chatNew' && e.target.value) { openT = e.target.value; renderPeople(); renderThread(); $('#chatText').focus(); } });
  $('#chatThread').addEventListener('submit', async e => {
    e.preventDefault();
    const t = $('#chatText').value.trim(); if (!t || !openT) return;
    $('#chatText').value = '';
    await S.add('msgs', { tid: openT, from: 'admin', text: t, at: now(), readA: true, readT: false });
  });

  // ---------------- روابط المعلمين ----------------
  const keys = () => (A.settings.keys = A.settings.keys || {});
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const linkOf = k => new URL('app/?k=' + k, location.href.split('#')[0]).href;
  function renderLinks() {
    const K = keys();
    if (!Object.keys(K).length) { $('#linkList').innerHTML = '<p class="muted">اضغط «تجهيز الروابط».</p>'; return; }
    $('#linkList').innerHTML = [...A.T].sort((a, b) => a.name.localeCompare(b.name, 'ar')).filter(t => K[t.id]).map(t =>
      `<div class="lk"><b>${esc(t.name)}</b>${A.supOf(t.id).length ? ' <span class="st auto">مشرف</span>' : ''}<span class="btn-row"><button class="btn sm" data-copy="${t.id}">نسخ</button><a class="btn sm" href="${linkOf(K[t.id])}" target="_blank" rel="noopener">فتح</a></span></div>`).join('');
  }
  async function makeLinks() {
    const K = keys();
    A.T.forEach(t => { if (!K[t.id]) K[t.id] = rnd(); });
    A.saveSettings();
    for (const t of A.T) await S.put('people/' + K[t.id], { tid: t.id, name: t.name, sup: A.supOf(t.id).length > 0, supLabel: A.supLabel(t.id) });
    renderLinks(); A.toast('الروابط جاهزة');
  }
  $('#btnLinks').addEventListener('click', makeLinks);
  const copy = async txt => { try { await navigator.clipboard.writeText(txt); A.toast('تم النسخ'); } catch (e) { prompt('انسخ:', txt); } };
  $('#linkList').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copy(linkOf(keys()[b.dataset.copy])); });
  $('#btnCopyAll').addEventListener('click', () => {
    const K = keys(); if (!Object.keys(K).length) return A.toast('جهّز الروابط أول');
    copy([...A.T].filter(t => K[t.id]).map(t => `${t.name}: ${linkOf(K[t.id])}`).join('\n'));
  });

  // ---------------- الشارة ----------------
  function badge() {
    const n = msgs.filter(m => m.from === 'teacher' && !m.readA).length + exps.filter(x => x.reply && !x.seenA).length;
    const el = $('#appBadge'); el.hidden = !n; el.textContent = n;
  }

  watchDay(); renderSend(); renderLinks();
})();
