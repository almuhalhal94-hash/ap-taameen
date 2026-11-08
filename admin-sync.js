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
  const short = n => String(n || '').replace(/^أ\.\s*/, '');
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
    if (!cur) return { ...base, to: w.to, toName: w.to ? tName(w.to) : '', emg: w.emg, status: statusFor(w.to), auto: false, first: w.to, refused: [], released: [], log: [], names: namesOf(w), createdAt: now(), updatedAt: now() };
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
      if (manual) A.toast(`✓ تم الإرسال لـ ${new Set(want.map(w => w.to).filter(Boolean)).size} معلم — يطلع لهم في التطبيق الحين`);
    } catch (e) { console.warn(e); A.toast('تعذّر الإرسال — تأكد من الاتصال'); }
    finally { busy = false; if (again) { again = false; publish(false); } }
    renderSend();
  }
  $('#btnSend').addEventListener('click', () => publish(true));
  document.querySelectorAll('[data-send-now]').forEach(b => b.addEventListener('click', () => publish(true)));

  // بعد أول إرسال لليوم: أي تعديل على التأمين يوصل تلقائي
  let tmr;
  document.addEventListener('apt:day', e => {
    watchDay();
    renderSend();
    // فتح الصفحة أو تغيير التاريخ ما يرسل شي، الإرسال التلقائي بس بعد تعديل فعلي
    if (e.detail !== 'load' && sentDays()[A.date]) { clearTimeout(tmr); tmr = setTimeout(() => publish(false), 600); }
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
        if (d.status === 'cancelled' || !(d.log || []).some(l => l.act !== 'accepted' && l.act !== 'reassigned')) continue;
        const next = d.kind === 'swap' ? (d.to ? { b: d.to, s2: d.s2, t2: d.t2 } : null) : (d.to || (d.emg ? 'E:' + d.emg : null));
        A.applyRefusal(d.date, { kind: d.kind, absent: d.absent, slot: d.slot }, d.refused, next);
      }
    }
    renderResp(); badge();
  }

  function renderSend() {
    const iso = A.date, n = desired().length, sent = !!sentDays()[iso];
    $('#respDay').textContent = `${A.weekdayName(iso)} ${A.fmtG(iso)}`;
    $('#btnSend').textContent = sent ? 'إعادة الإرسال' : 'إرسال تأمين اليوم للمعلمين';
    document.querySelectorAll('[data-send-now]').forEach(b => { b.textContent = sent ? '✓ انرسل — إعادة الإرسال' : '📲 إرسال للمعلمين'; b.classList.toggle('done', sent); });
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
      const ACT = { rejected: 'اعتذر', returned: 'تراجع عن اعتذاره وسيحضر', undo: 'تراجع خلال ثوانٍ', withdrew: 'اعتذر بعد القبول', askback: 'يطلب الرجوع للتكليف', admin: '', kept: 'أبقت الإدارة الزميل' };
      const notes = (d.log || []).filter(l => l.act in ACT && l.act !== 'accepted' && (l.note || l.act !== 'rejected')).map(l => `<div class="rnote ${l.act === 'admin' || l.act === 'kept' ? 'adm' : ''}">${esc(l.name)}${ACT[l.act] ? ': ' + ACT[l.act] : ''}${l.note ? ` — «${esc(l.note)}»` : ''} <small>${fmtTime(l.at)}</small></div>`).join('');
      const first = firstOf(d);
      const req = d.returnReq ? `<div class="rreq">⭐ <b>${esc(d.returnReq.name)}</b> (المكلّف الأول) تراجع عن اعتذاره ويطلب الرجوع، والزميل ${esc(d.toName)} استلم.
          <span class="btn-row"><button class="btn sm primary" data-ctl="giveback" data-id="${d.id}">اعتماد رجوعه</button><button class="btn sm" data-ctl="keep" data-id="${d.id}">إبقاء الزميل</button></span></div>` : '';
      const ctl = `<div class="rctl"><span>تحكم الإدارة:</span>
          <select data-assign="${d.id}"><option value="">إسناد إلى…</option>${assignOpts(d)}</select>
          ${first && first !== d.to && (d.refused || []).includes(first) ? `<button class="btn sm" data-ctl="first" data-id="${d.id}">↩ إرجاعه للمكلّف الأول (${esc(short((d.names || {})[first] || tName(first)))})</button>` : ''}</div>`;
      const who = d.to ? esc(d.toName) : d.emg ? `🛡 ${esc(d.emg)} <small>(الإدارة)</small>` : '<span class="muted">بدون مؤمّن</span>';
      const st = d.to ? `<span class="st ${d.status}">${d.status === 'accepted' ? '✓ قبل' : 'بانتظار الرد'}</span>` : '';
      const what = d.kind === 'swap'
        ? `يأخذ حصة ${esc(d.absentName)} <b>${esc(d.slotName)}</b> ${code(d.c)}، و${esc(d.absentName)} يأخذ حصته <b>${esc(d.s2Name || '')}</b>`
        : `${d.out ? 'مستأذن' : 'غائب'}: ${esc(d.absentName)} ${d.label && d.label !== 'حصة' ? '— ' + esc(d.label) : ''}${d.c ? ` · ${code(d.c)}` : ''}`;
      return `<div class="resp ${d.status}">
        <div class="rt"><span class="kind k-${d.kind}">${KIND[d.kind]}</span><b>${esc(d.slotName)}</b> <small dir="ltr">${esc(d.time)}</small></div>
        <div class="rw">${what}</div>
        <div class="rto">المكلّف: <b>${who}</b> ${st} ${d.auto ? '<span class="st auto">بديل تلقائي</span>' : ''}
          ${d.to ? `<button class="link" data-exp="${d.id}" data-t="${d.to}" data-r="${d.kind === 'duty' ? 'duty' : d.kind === 'swap' ? 'swapabs' : 'cover'}">استيضاح عدم حضور</button>` : ''}</div>
        ${ref ? `<div class="rref">اعتذر: ${ref}</div>` : ''}${notes}${req}${ctl}
      </div>`;
    }).join('');
  }
  // ---------------- تحكم الإدارة الكامل ----------------
  const firstOf = d => d.first || ((d.log || []).find(l => l.tid && l.tid !== 'admin') || {}).tid || d.to;
  const rowOf = d => d.kind === 'swap' ? null : A.state.rows.find(r => r.absent === d.absent && r.slot === d.slot);
  const swOf = d => { const sw = A.state.swaps.find(x => x.a === d.absent); const it = sw && sw.items.find(x => x.s === d.slot); return sw && it ? [sw, it] : null; };
  function choices(d) {
    // المعتذرون أولًا (يقدر يرفض عذرهم ويرجّع لهم التكليف)، بعدها المتاحين بالترتيب
    const out = [], seen = new Set([d.to]);
    (d.refused || []).forEach(id => { if (!seen.has(id)) { seen.add(id); out.push({ id, tag: id === firstOf(d) ? 'المكلّف الأول — اعتذر' : 'اعتذر' }); } });
    if (d.kind === 'swap') { const x = swOf(d); if (x) A.swapRanked(x[0], x[1]).forEach((o, k) => { if (!seen.has(o.b)) { seen.add(o.b); out.push({ id: o.b, tag: k < 4 ? RANKW[k] : '', s2: o }); } }); }
    else { const r = rowOf(d); if (r) A.ranked(r).forEach((id, k) => { if (!seen.has(id)) { seen.add(id); out.push({ id, tag: k < 4 ? RANKW[k] : '' }); } }); }
    return out;
  }
  const RANKW = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
  const emgNames = () => (A.settings.emergency || '').split('\n').map(x => x.trim()).filter(Boolean);
  const assignOpts = d => `<optgroup label="المعلمون">${choices(d).map(c => `<option value="${c.id}">${esc((d.names || {})[c.id] || tName(c.id))}${c.tag ? ' — ' + c.tag : ''}</option>`).join('')}</optgroup>`
    + (d.kind !== 'swap' ? `<optgroup label="🛡 الإدارة تؤمّن">${emgNames().filter(n => n !== d.emg).map(n => `<option value="E:${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
  async function adminEmg(id, name) {
    await S.tx('assign/' + id, c => {
      if (!c) return null;
      const prev = c.to;
      return { ...c, to: '', toName: '', emg: name, status: 'emergency', auto: false, returnReq: null,
        released: [...new Set([...(c.released || []), ...(prev ? [prev] : [])])],
        log: [...(c.log || []), { tid: 'admin', name: 'الإدارة', act: 'admin', note: `تؤمّنها الإدارة: ${name}`, at: now() }], updatedAt: now() };
    });
    A.toast(`تؤمّنها الإدارة: ${name}`);
  }
  async function adminAssign(id, tid, how) {
    const d = docs.find(x => x.id === id); if (!d) return;
    const ch = choices(d).find(c => c.id === tid);
    const nm = (d.names || {})[tid] || tName(tid);
    await S.tx('assign/' + id, c => {
      if (!c) return null;
      const prev = c.to;
      const n = { ...c, to: tid, toName: nm, status: how === 'accepted' ? 'accepted' : 'pending', auto: false, returnReq: null,
        refused: (c.refused || []).filter(x => x !== tid),
        released: [...new Set([...(c.released || []).filter(x => x !== tid), ...(prev && prev !== tid ? [prev] : [])])],
        adminNote: (c.refused || []).includes(tid) ? 'أعادت الإدارة هذا التكليف لك' : '',
        names: { ...(c.names || {}), [tid]: nm },
        log: [...(c.log || []), { tid: 'admin', name: 'الإدارة', act: 'admin', note: `أسندت التكليف إلى ${nm}`, at: now() }], updatedAt: now() };
      if (c.kind === 'swap') {
        const mine = ([...(c.log || [])].reverse().find(l => l.tid === tid && l.mine) || {}).mine || (ch && ch.s2 ? { s2: ch.s2.s2, s2Name: A.slotPlain(ch.s2.s2, c.c).name, s2Time: A.slotPlain(ch.s2.s2, c.c).time, t2: ch.s2.t2 } : null);
        if (mine) Object.assign(n, mine);
      }
      return n;
    });
    A.toast(`تم الإسناد إلى ${nm}`);
  }
  $('#respList').addEventListener('change', async e => {
    const sel = e.target.closest('select[data-assign]'); if (!sel || !sel.value) return;
    const d = docs.find(x => x.id === sel.dataset.assign), tid = sel.value;
    if (tid.startsWith('E:')) {
      const n = tid.slice(2);
      if (!(await A.ask(`${n} يؤمّن ${d.slotName}؟${d.to ? ` (يُعفى ${d.toName})` : ''}`, 'تأكيد'))) { sel.value = ''; return; }
      return adminEmg(d.id, n);
    }
    const nm = (d.names || {})[tid] || tName(tid);
    if (!(await A.ask(`إسناد ${d.slotName} إلى ${nm}؟${d.to ? ` (يُعفى ${d.toName})` : ''}`, 'إسناد'))) { sel.value = ''; return; }
    adminAssign(d.id, tid, 'pending');
  });
  $('#respList').addEventListener('click', async e => {
    const c = e.target.closest('[data-ctl]');
    if (c) {
      const d = docs.find(x => x.id === c.dataset.id); if (!d) return;
      if (c.dataset.ctl === 'first') { const f = firstOf(d); if (await A.ask(`إرجاع التكليف لـ ${(d.names || {})[f] || tName(f)} (المكلّف الأول) وإعفاء ${d.toName || 'الحالي'}؟`, 'إرجاع')) adminAssign(d.id, f, 'pending'); }
      if (c.dataset.ctl === 'giveback' && d.returnReq) adminAssign(d.id, d.returnReq.tid, 'accepted');
      if (c.dataset.ctl === 'keep') S.tx('assign/' + d.id, x => x && x.returnReq ? { ...x, returnReq: null, log: [...(x.log || []), { tid: 'admin', name: 'الإدارة', act: 'kept', at: now() }], updatedAt: now() } : null);
      return;
    }
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

  // ---------------- رموز الدخول ----------------
  // لكل معلم رمز من 6 أرقام، ولكل مشرف رمز ثاني يفتح له شاشة المتابعة
  const APP_URL = new URL('app/', location.href.split('#')[0].split('?')[0]).href;
  const codes = () => (A.settings.codes = A.settings.codes || {});
  const supCodes = () => (A.settings.supCodes = A.settings.supCodes || {});
  const isSup = id => A.supOf(id).length > 0;
  const newCode = used => { let c; do { c = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); } while (used.has(c)); used.add(c); return c; };
  const msgFor = t => {
    const c = codes()[t.id], sc = supCodes()[t.id];
    return `السلام عليكم ${t.name}\nتطبيق التأمين والتبديل — مدرسة ابن رشد:\n${APP_URL}\nرمز دخولك: ${c}${isSup(t.id) ? '\n(نفس الرمز يفتح لك تكليفاتك ومتابعة صفوف إشرافك)' : ''}\nالرمز خاص بك، فضلًا لا تشاركه.`;
  };
  function renderLinks() {
    const C = codes(), SC = supCodes();
    if (!Object.keys(C).length) { $('#linkList').innerHTML = '<p class="muted">اضغط «تجهيز الرموز».</p>'; return; }
    $('#linkList').innerHTML = `<p class="hint">رابط التطبيق للجميع: <b dir="ltr">${esc(APP_URL)}</b> — وكل واحد يدخل برمزه.</p>` + [...A.T].sort((a, b) => a.name.localeCompare(b.name, 'ar')).filter(t => C[t.id]).map(t =>
      `<div class="lk"><b>${esc(t.name)}</b><span class="codes"><span class="code-pill" title="رمز الدخول">${C[t.id]}</span>${isSup(t.id) ? '<span class="code-pill sup" title="نفس الرمز للمعلم والمشرف">معلم + مشرف</span>' : ''}</span><span class="btn-row"><button class="btn sm" data-copy="${t.id}">نسخ الرسالة</button></span></div>`).join('');
  }
  async function makeCodes(again) {
    const C = codes(), SC = supCodes();
    if (again && !(await A.ask('تجديد كل الرموز؟ الرموز القديمة تتوقف، ولازم ترسل الجديدة لكل المعلمين.', 'تجديد'))) return;
    const used = new Set([...Object.values(C), ...Object.values(SC)]);
    const old = again ? [...Object.values(C), ...Object.values(SC)] : [];
    if (again) { A.settings.codes = {}; A.settings.supCodes = {}; used.clear(); }
    const C2 = codes();
    // المشرف برمز واحد مع المعلم: نلغي رموز المشرف المنفصلة القديمة
    const oldSup = Object.values(supCodes()); A.settings.supCodes = {};
    A.T.forEach(t => { if (!C2[t.id]) C2[t.id] = newCode(used); });
    A.saveSettings();
    $('#btnLinks').disabled = true;
    try {
      for (const t of A.T) {
        const sp = isSup(t.id);
        await S.put('people/' + C2[t.id], { tid: t.id, name: t.name, role: sp ? 'both' : 'teacher', sup: sp, supLabel: sp ? A.supLabel(t.id) : '' });
      }
      for (const c of oldSup) await S.put('people/' + c, { revoked: true });
      for (const c of old) await S.put('people/' + c, { revoked: true });
      A.toast('الرموز جاهزة');
    } catch (e) { A.toast('تعذّر الحفظ — تأكد من الاتصال'); }
    $('#btnLinks').disabled = false;
    renderLinks();
  }
  $('#btnLinks').addEventListener('click', () => makeCodes(false));
  $('#btnRenew').addEventListener('click', () => makeCodes(true));
  const copy = async txt => { try { await navigator.clipboard.writeText(txt); A.toast('تم النسخ'); } catch (e) { prompt('انسخ:', txt); } };
  $('#linkList').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copy(msgFor(A.byId[b.dataset.copy])); });
  $('#btnCopyAll').addEventListener('click', () => {
    const C = codes(); if (!Object.keys(C).length) return A.toast('جهّز الرموز أول');
    copy([...A.T].filter(t => C[t.id]).sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(t => `${short(t.name)}: ${C[t.id]}${isSup(t.id) ? ' (معلم + مشرف)' : ''}`).join('\n') + `\n\nالرابط: ${APP_URL}`);
  });

  // ---------------- الشارة ----------------
  function badge() {
    const n = msgs.filter(m => m.from === 'teacher' && !m.readA).length + exps.filter(x => x.reply && !x.seenA).length;
    const el = $('#appBadge'); el.hidden = !n; el.textContent = n;
  }

  watchDay(); renderSend(); renderLinks();
})();
