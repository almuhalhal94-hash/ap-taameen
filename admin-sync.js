// الإداري: إرسال التأمين والتبديل لجوالات المعلمين، ومتابعة الردود، والاستيضاح، والمحادثات
(async () => {
  'use strict';
  const A = window.APT;
  if (!A || !window.Sync) return;
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  const S = await window.Sync.ready;
  const DEMO = S.mode === 'demo';
  let pstat = [], csRange = 'week', docs = [], exps = [], msgs = [], allDocs = [], alerts = [], alertsReady = false, reqs = [], reqsReady = false;
  const ORDER = ['1', '2', 'B1', '3', 'B2', '4', '5', '6', '7'];
  // ساعة الجهاز: نصحّحها من وقت الخادم (جهاز الإدارة كان مقدّم 12 ساعة وخرّب الأوقات)
  let SKEW = 0;
  const now = () => Date.now() + SKEW;
  const todayISO = () => A.isoOf(new Date(now()));
  // رقم ثابت لهذا الجهاز: عشان جهاز ما يلغي تكليفات أرسلها جهاز ثاني بدون ما يدري
  const DEV = (() => { try { let d = localStorage.getItem('apt-dev'); if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem('apt-dev', d); } return d; } catch (e) { return 'd-anon'; } })();
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

  const lastAct = (c, tid) => { const l = [...(c.log || [])].reverse().find(x => x.tid === tid && ['accepted', 'returned', 'undo', 'rejected', 'withdrew'].includes(x.act)); return l && (l.act === 'accepted' || l.act === 'returned') ? 'ok' : ''; };
  function merged(cur, w) {
    const base = { ...w.info, backups: w.backups, sups: w.sups };
    const statusFor = to => to ? 'pending' : (w.emg ? 'emergency' : 'none');
    if (!cur) return { ...base, to: w.to, toName: w.to ? tName(w.to) : '', emg: w.emg, status: statusFor(w.to), auto: false, first: w.to, refused: [], released: [], log: [], names: namesOf(w), dev: DEV, createdAt: now(), updatedAt: now() };
    const n = { ...cur, ...base, names: { ...(cur.names || {}), ...namesOf(w) }, dev: DEV };
    if (cur.status === 'cancelled' || cur.to !== w.to || (!w.to && cur.emg !== w.emg)) {
      if (cur.to && cur.to !== w.to && cur.status !== 'cancelled') n.log = [...(cur.log || []), { tid: cur.to, name: cur.toName, act: 'reassigned', at: now() }];
      Object.assign(n, { to: w.to, toName: w.to ? tName(w.to) : '', emg: w.emg, status: statusFor(w.to), auto: false });
      // التكليف انلغى ورجع لنفس المعلم وهو كان مستلمه: يظل «مستلم» وما ينطلب منه يستلم مرة ثانية
      if (cur.status === 'cancelled' && w.to && cur.to === w.to && lastAct(cur, w.to) === 'ok') n.status = 'accepted';
    }
    // «إعادة الإرسال» يذكّر اللي ما استلم بعد (الحارس يرسل له تذكير)
    if (NUDGE && cur.status === 'pending' && n.status === 'pending' && n.to) n.nudgeAt = now();
    const strip = x => { const { updatedAt, ...r } = x; return JSON.stringify(r); };
    if (strip(n) === strip(cur)) return null;
    n.updatedAt = now();
    return n;
  }

  let busy = false, again = false, NUDGE = false;
  const sentDays = () => (A.settings.sentDays = A.settings.sentDays || {});
  async function publish(manual) {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const iso = A.date, want = desired(), ids = new Set(want.map(w => w.id));
      if (manual && !want.length) { A.toast('ما فيه تأمين أو تبديل لهذا اليوم'); return; }
      NUDGE = !!manual && !!sentDays()[iso];
      for (const w of want) await S.tx('assign/' + w.id, cur => merged(cur, w));
      NUDGE = false;
      const gone = docs.filter(d => d.date === iso && !ids.has(d.id) && d.status !== 'cancelled');
      const foreign = gone.filter(d => d.dev && d.dev !== DEV);
      let okForeign = false;
      if (foreign.length && manual) okForeign = await A.ask(`تنبيه: فيه ${foreign.length} تكليف لهذا اليوم انرسل من جهاز ثاني، ومو موجود في سجل هذا الجهاز:\n${foreign.slice(0, 8).map(d => '• ' + (d.slotName || '') + ' ' + (d.c || '') + ' — ' + (d.toName || d.absentName || '')).join('\n')}\n\nتبي تلغيها؟ (لو مو متأكد اختر «لا» وراجع الجهاز الثاني)`, 'نعم، ألغها');
      if (foreign.length && !manual) A.toast(`فيه ${foreign.length} تكليف من جهاز ثاني ما انلغى — راجعها`);
      for (const d of gone) if (!d.dev || d.dev === DEV || okForeign) await S.set('assign/' + d.id, { status: 'cancelled', updatedAt: now(), dev: DEV });
      if (!sentDays()[iso]) { sentDays()[iso] = true; A.saveSettings(); }
      if (manual) A.toast(`✓ تم الإرسال لـ ${new Set(want.map(w => w.to).filter(Boolean)).size} معلم — يطلع لهم في التطبيق الحين`);
    } catch (e) { console.warn(e); A.toast('تعذّر الإرسال — تأكد من الاتصال'); }
    finally { busy = false; NUDGE = false; if (again) { again = false; publish(false); } }
    renderSend();
  }
  // تأكيد للمدير المساعد قبل الإرسال لو فيه مؤمّن عنده 4 حصص فأكثر اليوم
  const sendNow = async () => {
    const h = A.dayHeavyAssigned ? A.dayHeavyAssigned() : [];
    if (h.length && !(await A.ask(`تنبيه: هؤلاء عندهم 4 حصص فأكثر اليوم:\n${h.join('\n')}\n\nمتأكد ترسل التأمين عليهم؟ (تقدر تغيّرهم من زر «تغيير»)`, 'نعم، أرسل'))) return;
    publish(true);
  };
  $('#btnSend').addEventListener('click', sendNow);
  document.querySelectorAll('[data-send-now]').forEach(b => b.addEventListener('click', sendNow));

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
        const sw = st.swaps.find(x => x.a === d.absent && x.items.some(i => i.s === d.slot)), it = sw && sw.items.find(x => x.s === d.slot);
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
    if (A.refreshSum) A.refreshSum();
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
    const all = docs.filter(d => d.date === A.date && d.status !== 'cancelled');
    const cnt = {}; all.forEach(d => { const k = viewState(d).k; cnt[k] = (cnt[k] || 0) + 1; });
    const legend = VS_ORDER.filter(k => cnt[k]).map(k => `<span class="vchip v-${k}">${VS[k].icon} ${VS[k].short} <b>${cnt[k]}</b></span>`).join('');
    $('#respList').innerHTML = (legend ? `<div class="vlegend">${legend}</div>` : '') + list.map(d => {
      const ref = (d.refused || []).map(id => `<span class="who bad">${esc((d.names || {})[id] || tName(id))} <button class="link" data-exp="${d.id}" data-t="${id}" data-r="${d.kind === 'swap' ? 'swap' : 'refuse'}">استيضاح</button></span>`).join('');
      const ACT = { rejected: 'اعتذر', returned: 'تراجع عن اعتذاره وسيحضر', undo: 'تراجع خلال ثوانٍ', withdrew: 'اعتذر بعد القبول', askback: 'يطلب الرجوع للتكليف', admin: '', kept: 'أبقت الإدارة الزميل' };
      // السجل الكامل مطوي، والظاهر بس الحالة الأخيرة (الشريط الملون) عشان ما تتكدس «أسندت…» فوق بعض
      const HIST = { ...ACT, accepted: 'استلم التكليف ✓', admin: '' };
      const hl = (d.log || []).filter(l => l.act in HIST);
      const lastAdm = [...hl].reverse().find(l => l.act === 'admin');
      const notes = hl.length ? `<details class="rhist"><summary>سجل التكليف (${hl.length}) — آخر حركة ${fmtTime(hl[hl.length - 1].at)}</summary>${hl.map((l, k) => `<div class="rnote ${l.act === 'admin' || l.act === 'kept' ? 'adm' : ''} ${l === lastAdm ? 'last' : l.act === 'admin' ? 'old' : ''}"><span class="n">${k + 1}</span>${esc(l.name)}${HIST[l.act] ? ': ' + HIST[l.act] : ''}${l.note ? ` — ${l.act === 'admin' ? esc(l.note) : '«' + esc(l.note) + '»'}` : ''}${l.act === 'admin' && l !== lastAdm ? ' <small class="muted">(أُلغي بإسناد لاحق)</small>' : ''} <small>${fmtTime(l.at)}</small></div>`).join('')}</details>` : '';
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
      const vs = viewState(d);
      return `<div class="resp ${d.status} v-${vs.k}">
        <div class="vstate">${vs.icon} ${vs.txt}</div>
        <div class="rt"><span class="kind k-${d.kind}">${KIND[d.kind]}</span><b>${esc(d.slotName)}</b> <small dir="ltr">${esc(d.time)}</small></div>
        <div class="rw">${what}</div>
        <div class="rto">المكلّف: <b>${who}</b> ${st} ${d.auto ? '<span class="st auto">بديل تلقائي</span>' : ''}
          ${d.to ? `<button class="link" data-exp="${d.id}" data-t="${d.to}" data-r="${d.kind === 'duty' ? 'duty' : d.kind === 'swap' ? 'swapabs' : 'cover'}">استيضاح عدم حضور</button>` : ''}</div>
        ${ref ? `<div class="rref">اعتذر: ${ref}</div>` : ''}${notes}${req}${ctl}
      </div>`;
    }).join('');
  }
  // حالة البطاقة بلون واضح للإداري: أخضر استلم، برتقالي اعتذر وانتقل، أحمر يحتاج قرار، ذهبي بانتظار، أزرق الإدارة
  const VS = {
    ok: { icon: '✓', short: 'تم الاستلام' },
    moved: { icon: '↺', short: 'اعتذار وانتقل لزميل' },
    act: { icon: '⚠', short: 'يحتاج قرارك' },
    wait: { icon: '⏳', short: 'بانتظار الاستلام' },
    emg: { icon: '🛡', short: 'الإدارة تؤمّن' },
    none: { icon: '✕', short: 'بدون مؤمّن' }
  };
  const VS_ORDER = ['act', 'none', 'moved', 'wait', 'ok', 'emg'];
  // آخر حركة في السجل كانت إسناد من الإدارة (أو قبول بعده)
  const lastAdmin = d => { const l = (d.log || []).filter(x => x.act !== 'accepted'); return l.length && l[l.length - 1].act === 'admin'; };
  function viewState(d) {
    const nm = id => (d.names || {})[id] || tName(id);
    const ref = d.refused || [];
    const last = [...(d.log || [])].reverse().find(l => l.tid !== 'admin') || {};
    const lastRef = ref.length ? nm(ref[ref.length - 1]) : '';
    let k, txt;
    if (d.returnReq) { k = 'act'; txt = `${esc(d.returnReq.name)} يطلب الرجوع للتكليف — قرر الآن`; }
    else if (!d.to && !d.emg) { k = 'none'; txt = ref.length ? `اعتذر ${esc(lastRef)} وما فيه بديل — أسندها لأحد` : 'بدون مؤمّن — أسندها لأحد'; }
    else if (d.emg && !d.to) { k = 'emg'; txt = `تؤمّنها الإدارة: ${esc(d.emg)}`; }
    else if (d.status === 'accepted') {
      k = ref.length ? 'moved' : 'ok';
      txt = ref.length ? `اعتذر ${esc(lastRef)} ← واستلمها ${esc(d.toName)} ✓` : `استلم ${esc(d.toName)} التكليف${lastAdmin(d) ? ' (بإسناد الإدارة)' : ''}`;
      if (!ref.length) k = 'ok';
    }
    else if (last.act === 'withdrew') { k = 'act'; txt = `${esc(last.name)} اعتذر بعد ما استلم — انتقل إلى ${esc(d.toName)} (بانتظار استلامه)`; }
    else if (ref.length) { k = 'moved'; txt = `اعتذر ${esc(lastRef)} ← انتقل إلى ${esc(d.toName)} (بانتظار استلامه)`; }
    else if (last.act === 'returned' || last.act === 'undo') { k = 'wait'; txt = `${esc(last.name)} تراجع عن اعتذاره — بانتظار استلامه`; }
    else if (lastAdmin(d)) { k = 'wait'; txt = `أسندته الإدارة إلى ${esc(d.toName)} — بانتظار استلامه`; }
    else { k = 'wait'; txt = `بانتظار استلام ${esc(d.toName)}`; }
    return { k, txt, icon: VS[k].icon };
  }
  // ---------------- تحكم الإدارة الكامل ----------------
  const firstOf = d => d.first || ((d.log || []).find(l => l.tid && l.tid !== 'admin') || {}).tid || d.to;
  const rowOf = d => d.kind === 'swap' ? null : A.state.rows.find(r => r.absent === d.absent && r.slot === d.slot);
  const swOf = d => { const sw = A.state.swaps.find(x => x.a === d.absent && x.items.some(i => i.s === d.slot)); const it = sw && sw.items.find(x => x.s === d.slot); return sw && it ? [sw, it] : null; };
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
        <div><div class="role">المدير المساعد</div><div class="pname">${esc(st.assistant || 'أ. أنور الجابري')}</div><div class="sigline">التوقيع</div></div>
        <div><div class="role">مدير المدرسة</div><div class="pname">${esc(st.principal || 'أ. خالد السيد')}</div><div class="sigline">التوقيع</div></div>
      </div>`;
    const old = document.title; document.title = `استيضاح — ${x.name}`;
    const img = $('#printSheet img');
    const go = () => { window.print(); document.title = old; };
    if (img.complete) go(); else img.onload = img.onerror = go;
  }

  const PER = x => ({ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة', 5: 'الخامسة', 6: 'السادسة', 7: 'السابعة' })[x] || x;
  // ---------------- المحادثات ----------------
  let openT = '';
  S.watch('msgs', null, all => {
    const nq = all.filter(m => (m.type === 'req' || m.type === 'absreq') && m.status !== 'cancelled').sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.at - a.at);
    if (reqsReady) nq.filter(q => q.status === 'pending' && !reqs.some(o => o.id === q.id)).forEach(q => {
      const ab = q.type === 'absreq', t = ab ? `✉ طلب تأمين حصص (غياب بعذر رسمي) من ${q.name}` : `⇄ طلب تبديل من ${q.name}`, body = `${A.weekdayName(q.date)} ${A.fmtG(q.date)} — الحصص: ${q.full ? 'اليوم كامل' : q.slots.map(PER).join('، ')} — ${ab ? q.kindTxt : q.reason}`;
      A.toast(t);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification(t, { body, lang: 'ar', dir: 'rtl', tag: q.id }); } catch (e) { }
    });
    reqs = nq; reqsReady = true;
    pstat = all.filter(m => m.type === 'pushstat'); renderPushStats();
    msgs = all.filter(m => !m.type).sort((a, b) => a.at - b.at); renderPeople(); renderThread(); renderReqs(); renderAlerts(); badge();
  });
  function reqCardHTML(q, compact) {
    const when = `${esc(A.weekdayName(q.date))} ${esc(A.fmtG(q.date))}`;
    const ab = q.type === 'absreq';
    const ST = { pending: ['act', '⏳ بانتظار قرارك'], approved: ['ok', ab ? '✓ اعتُمد وسُجّل الغياب' : '✓ تمت الموافقة'], declined: ['none', '✕ ما اعتُمد'] };
    const st = ST[q.status] || ST.pending;
    const res = (q.result || []).map(x => `<div class="rnote ${x.ok ? '' : 'adm'}">${x.ok ? (ab ? '✓' : '⇄') : '⚠'} ${esc(x.txt)}</div>`).join('');
    const per = q.full ? 'اليوم كامل' : q.slots.map(k => PER(k) + (q.cls && q.cls[k] ? ` (${code(q.cls[k])})` : '') + (q.want && q.want[k] ? ` ← يبي يدخل بدالها ${PER(q.want[k])}` : '')).join('، ');
    const btns = q.status !== 'pending' ? '' : ab
      ? `<div class="btn-row" style="margin-top:8px"><button class="btn sm primary" data-ab-ok="${q.id}">✓ اعتماد وتوزيع حصصه</button><button class="btn sm" data-rq-no="${q.id}">اعتذار عن الطلب</button></div>`
      : `<div class="btn-row" style="margin-top:8px"><button class="btn sm primary" data-rq-auto="${q.id}">⚡ تبديل تلقائي</button><button class="btn sm" data-rq-manual="${q.id}">✋ أرتبه بنفسي</button><button class="btn sm" data-rq-no="${q.id}">اعتذار عن الطلب</button></div>`;
    const urgent = q.date === todayISO() ? ' <span class="urg">🔴 اليوم — طارئ</span>' : '';
    const head = (ab ? `طلب تأمين حصص (غياب بعذر رسمي) من ${esc(q.name)}` : `طلب تبديل من ${esc(q.name)}`) + urgent;
    const why = ab ? `العذر: <b>${esc(q.kindTxt || '')}</b>${q.reason ? ` — «${esc(q.reason)}»` : ''} · تعهّد بتقديم الإثبات` : `السبب: «${esc(q.reason)}»${q.prefer ? ` · الزميل المقترح: <b>${esc(q.prefer)}</b>` : ''}`;
    return `<div class="resp v-${st[0]} ${ab ? 'is-abs' : ''}"><div class="vstate">${st[1]} — ${head}</div>
      <div class="rw"><b>${when}</b> · الحصص: <b>${per}</b></div>
      <div class="rw">${why}</div>${res}${q.adminNote ? `<div class="rnote adm">ردّ الإدارة: ${esc(q.adminNote)}</div>` : ''}${compact ? '' : btns}</div>`;
  }
  async function absOk(id) {
    const q = reqs.find(x => x.id === id); if (!q) return;
    if (!(await A.ask(`متأكد تريد اعتماد غياب ${q.name}\nيوم ${A.weekdayName(q.date)} ${A.fmtG(q.date)}\nالحصص: ${q.full ? 'اليوم كامل' : q.slots.map(PER).join('، ')}\nالعذر: ${q.kindTxt || ''}\n\nيتسجّل غائبًا في ذاك اليوم ويتوزّع تأمين حصصه تلقائيًا.`, 'نعم، اعتمد'))) return;
    const r = A.absenceRequest(q.date, q.tid, q.slots || [], !!q.full);
    if (r.err) { await A.ask(r.err + '\n\nتقدر تعتذر عن الطلب أو تسجّل الغياب بنفسك من «التأمين».', 'حسنًا'); return; }
    const result = [{ ok: true, txt: `تم اعتماد غيابك، وتوزّعت حصصك (${r.n}) على الزملاء${r.covered < r.n ? ' — والباقي ترتّبه الإدارة' : ''}` }];
    await S.set('msgs/' + id, { status: 'approved', result, decidedAt: now(), readT: false });
    if (sentDays()[q.date]) await publish(false);
    document.querySelector('.tab[data-tab="today"]').click();
    A.toast(`اعتُمد غياب ${q.name} — راجع توزيع يوم ${A.weekdayName(q.date)}، وأرسله للمعلمين في يومه`);
  }
  function renderReqs() {
    const list = reqs.filter(q => q.date >= todayISO() || q.status === 'pending');
    $('#reqAdmin').innerHTML = list.length ? list.map(q => reqCardHTML(q)).join('') : '<p class="muted">ما فيه طلبات تبديل أو تأمين.</p>';
  }
  async function reqAuto(id) {
    const q = reqs.find(x => x.id === id); if (!q) return;
    if (!(await A.ask(`ترتيب تبديل تلقائي لـ ${q.name} يوم ${A.weekdayName(q.date)} ${A.fmtG(q.date)} (الحصص: ${q.slots.map(PER).join('، ')})؟`, 'رتّب التبديل'))) return;
    const r = A.swapRequest(q.date, q.tid, q.slots, q.reason, q.prefer, q.want || {});
    if (r.err) { A.toast(r.err); await A.ask(r.err + '\n\nتقدر ترتبه بنفسك من «التبديل والاستئذان» أو تعتذر عن الطلب.', 'حسنًا'); return; }
    const result = r.result.concat(r.skipped.length ? [{ ok: false, txt: `الحصص ${r.skipped.join('، ')}: ما عندك فيها حصة تدريس` }] : []);
    await S.set('msgs/' + id, { status: 'approved', result, decidedAt: now(), readT: false });
    if (!sentDays()[q.date]) await publish(false);
    const sw = r.result.filter(x => x.ok && !x.cover).length, cv = r.result.filter(x => x.cover).length;
    if (r.uncovered && r.uncovered.length) await A.ask(`⚠️ انتبه: ${r.uncovered.join('، ')} لـ ${q.name} ما تيسّر لها تبديل ولا مؤمّن متاح.\n\nرتّبها بنفسك من «التأمين» (اختر مؤمّن أو «الإدارة»)، وإلا يظل الصف بدون أحد.`, 'حسنًا');
    else A.toast(cv ? `تبدّل ${sw} وتأمّن ${cv} — وصل الرد لـ ${q.name}` : `تم التبديل ووصل الرد لـ ${q.name}`);
  }
  async function reqManual(id) {
    const q = reqs.find(x => x.id === id); if (!q) return;
    if (q.date !== A.date) { $('#dateInput').value = q.date; $('#dateInput').dispatchEvent(new Event('change')); }
    A.openSwap();
    A.toast(`رتّب تبديل ${q.name} (${q.slots.map(PER).join('، ')}) من هنا، ثم ارجع واضغط «⚡ تبديل تلقائي» أو بلّغه من المحادثة`);
  }
  async function reqNo(id) {
    const q = reqs.find(x => x.id === id); if (!q) return;
    const note = prompt(`سبب عدم اعتماد طلب ${q.name} (يوصله على جواله):`, q.type === 'absreq' ? 'نعتذر عن اعتماد الطلب، فضلًا راجع الإدارة.' : 'نعتذر، لا يتوفر بديل مناسب في هذا اليوم.');
    if (note === null) return;
    await S.set('msgs/' + id, { status: 'declined', adminNote: note.trim(), decidedAt: now(), readT: false });
    A.toast('وصل الرد للمعلم');
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-rq-auto]'), m = e.target.closest('[data-rq-manual]'), n = e.target.closest('[data-rq-no]'), ok = e.target.closest('[data-ab-ok]');
    if (ok) absOk(ok.dataset.abOk);
    if (a) reqAuto(a.dataset.rqAuto); if (m) reqManual(m.dataset.rqManual); if (n) reqNo(n.dataset.rqNo);
  });
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
    const c = codes()[t.id];
    return `السلام عليكم ورحمة الله وبركاته\n${t.name} المحترم\n\n*تطبيق التأمين والتبديل*\nمدرسة ابن رشد الإعدادية للبنين\n\n🔗 رابط التطبيق:\n${APP_URL}\n\n🔑 رمز دخولك: *${c}*${isSup(t.id) ? '\n(نفس الرمز يفتح لك تكليفاتك ومتابعة صفوف إشرافك)' : ''}\n\n⚠️ الرمز خاص بك، فضلًا لا تشاركه مع أحد.\nشاكرين تعاونكم 🌷`;
  };
  // صفحة واحدة فيها رسالة كل معلم مستقلة (مجمّعة حسب القسم) — يرسلها المدير واحدة واحدة
  function msgPage() {
    const C = codes();
    const e = x => String(x).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
    const html = depts().map(d => {
      const ts = A.T.filter(t => t.dept === d && C[t.id]).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      if (!ts.length) return '';
      const dAll = ts.map(t => msgFor(t)).join('\n\n━━━━━━━━━━━━\n\n');
      return `<section><h2>${e(d)} <small>${ts.length} معلم</small><button type="button" class="dc" data-m="${e(dAll)}">نسخ رسائل القسم</button></h2>` + ts.map(t => {
        const m = msgFor(t);
        return `<article><div class="h"><b>${e(t.name)}</b><span class="c">${C[t.id]}</span></div><pre>${e(m.replace(/\*/g, ''))}</pre><div class="b"><a class="wa" href="https://wa.me/?text=${encodeURIComponent(m)}" target="_blank">إرسال بالواتساب</a><button type="button" data-m="${e(m)}">نسخ الرسالة</button></div></article>`;
      }).join('') + '</section>';
    }).join('');
    const today = A.fmtG(todayISO());
    const all = A.T.filter(t => C[t.id]).map(t => msgFor(t)).join('\n\n━━━━━━━━━━━━\n\n');
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>رسائل رموز دخول المعلمين</title><style>
body{margin:0;background:#f7f1e8;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;color:#2b1a12}
header{background:linear-gradient(135deg,#4a0710,#7a1424);color:#fff;padding:22px 18px 18px;border-bottom:4px solid #e2b45a}
header h1{margin:0 0 4px;font-size:1.35rem;color:#f6d690}header p{margin:0;font-size:.9rem;color:#f3e3d0}
.how{margin:14px;padding:12px 14px;background:#fff;border:1px solid #ead9bd;border-radius:14px;font-size:.9rem;line-height:1.8}
.how b{color:#6b0f1a}.warn{color:#9b1c1c;font-weight:700}
main{padding:0 14px 20px;max-width:760px;margin:auto}
h2{margin:22px 0 10px;padding:9px 14px;border-radius:12px;background:#6b0f1a;color:#f6d690;font-size:1.05rem;position:sticky;top:0;z-index:2}
h2 small{color:#f3e3d0;font-weight:400;font-size:.8rem;margin-inline-start:6px}
article{background:#fff;border:1px solid #ead9bd;border-radius:14px;padding:12px 14px;margin-bottom:10px}
.h{display:flex;align-items:center;gap:10px;margin-bottom:6px}.h b{flex:1;font-size:1.02rem}
.c{direction:ltr;font-weight:800;letter-spacing:2px;background:#f6ecd8;border-radius:8px;padding:3px 10px;color:#4a0a12}
pre{white-space:pre-wrap;unicode-bidi:plaintext;text-align:right;font-family:inherit;font-size:.85rem;line-height:1.7;background:#f9f6f1;border-radius:10px;padding:10px;margin:0 0 10px;color:#3a2a20}
.b{display:flex;gap:8px}.b a,.b button{flex:1;text-align:center;padding:11px;border-radius:11px;font:inherit;font-weight:700;font-size:.92rem;text-decoration:none;cursor:pointer}
.wa{background:#1f8f4e;color:#fff;border:0}.b button{background:#fff;color:#6b0f1a;border:1.5px solid #c9a35a}
.all{display:block;width:100%;margin-top:10px;padding:12px;border-radius:12px;border:0;background:#6b0f1a;color:#f6d690;font:inherit;font-weight:800;font-size:1rem;cursor:pointer}
h2{display:flex;align-items:center;gap:6px}.dc{margin-inline-start:auto;padding:6px 10px;border-radius:9px;border:1px solid #e2b45a;background:transparent;color:#f6d690;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
.done{opacity:.55}.done .h b:after{content:'  ✓ أُرسلت';color:#1f8f4e;font-size:.8rem}
footer{text-align:center;font-size:.8rem;color:#7a6650;padding:18px;line-height:1.9;border-top:1px solid #ead9bd}
</style></head><body><header><h1>رسائل رموز دخول المعلمين</h1><p>تطبيق التأمين والتبديل — مدرسة ابن رشد الإعدادية للبنين · ${today}</p></header>
<div class="how"><b>طريقة الإرسال:</b> لكل معلم رسالة مستقلة. اضغط <b>«إرسال بالواتساب»</b> واختر المعلم من جهات الاتصال، أو <b>«نسخ الرسالة»</b> والصقها في محادثته الخاصة. البطاقة تتعلّم «أُرسلت» بعد الضغط.<br><span class="warn">⚠️ هذه الصفحة فيها رموز كل المعلمين — لا تُرسل لأي قروب، واحذفها بعد الانتهاء.</span><button type="button" class="all" data-m="${e(all)}">📋 نسخ عام — كل الرسائل</button></div>
<main>${html}</main><footer>إعداد: أ. طلال سعود | المديران المساعدان: أ. أنور الجابري، أ. أحمد بوجيري | مدير المدرسة: أ. خالد السيد</footer>
<script>document.addEventListener('click',function(ev){var a=ev.target.closest('a.wa,button[data-m]');if(!a)return;var art=a.closest('article');var lab=a.textContent;if(a.dataset.m){ev.preventDefault();var t=a.dataset.m;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){a.textContent='✓ تم النسخ'},function(){var x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();document.execCommand('copy');x.remove();a.textContent='✓ تم النسخ'})}if(art)art.classList.add('done');else setTimeout(function(){a.textContent=lab},1800)});<\/script></body></html>`;
  }

  const DEPT_ORDER = ['التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية', 'الرياضيات', 'العلوم', 'المواد الاجتماعية', 'التصميم والتقانة', 'اللغة الفرنسية', 'التربية الرياضية'];
  const depts = () => { const ds = [...new Set(A.T.map(t => t.dept))]; return ds.sort((a, b) => (DEPT_ORDER.indexOf(a) + 1 || 99) - (DEPT_ORDER.indexOf(b) + 1 || 99)); };
  const deptMsg = d => {
    const C = codes();
    const ts = A.T.filter(t => t.dept === d && C[t.id]).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return `رموز دخول قسم ${d}\nتطبيق التأمين والتبديل — مدرسة ابن رشد\nالرابط: ${APP_URL}\n\n` + ts.map(t => `${t.name}: ${C[t.id]}${isSup(t.id) ? ' (معلم + مشرف)' : ''}`).join('\n') + `\n\nكل رمز خاص بصاحبه فقط، فضلًا لا يُصوَّر ولا يُشارَك.\n(الرموز القديمة توقفت)`;
  };
  function renderLinks() {
    const C = codes();
    if (!Object.keys(C).length) { $('#linkList').innerHTML = '<p class="muted">اضغط «تجهيز الرموز».</p>'; return; }
    $('#linkList').innerHTML = `<p class="hint">رابط التطبيق للجميع: <b dir="ltr">${esc(APP_URL)}</b> — وكل واحد يدخل برمزه. انسخ رموز كل قسم وأرسلها لمنسقه أو معلمه الأول.</p>` + depts().map(d => {
      const ts = A.T.filter(t => t.dept === d && C[t.id]).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      if (!ts.length) return '';
      return `<div class="lk-dept"><div class="lk-dh"><b>${esc(d)}</b><span class="muted">${ts.length} معلم</span><button class="btn sm primary" data-copyd="${esc(d)}">نسخ رموز القسم</button></div>` + ts.map(t =>
        `<div class="lk"><b>${esc(t.name)}</b><span class="codes"><span class="code-pill" title="رمز الدخول">${C[t.id]}</span>${isSup(t.id) ? '<span class="code-pill sup" title="نفس الرمز للمعلم والمشرف">معلم + مشرف</span>' : ''}</span><span class="btn-row"><button class="btn sm" data-copy="${t.id}">نسخ الرسالة</button></span></div>`).join('') + '</div>';
    }).join('');
  }
  async function makeCodes(again) {
    const C = codes(), SC = supCodes();
    if (again && !(await A.ask('متأكد تريد تجديد رموز كل المعلمين؟\nكل الرموز القديمة تتوقف فورًا، ولازم ترسل الجديدة لكل قسم.', 'نعم، جدّد'))) return;
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
  $('#btnMsgPage').addEventListener('click', () => {
    if (!Object.keys(codes()).length) return A.toast('جهّز الرموز أول');
    const blob = new Blob([msgPage()], { type: 'text/html;charset=utf-8' });
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = 'taameen-codes.html'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    A.toast('تنزّلت الصفحة — أرسلها للمدير بالخاص');
  });
  const copy = async txt => { try { await navigator.clipboard.writeText(txt); A.toast('تم النسخ'); } catch (e) { prompt('انسخ:', txt); } };
  $('#linkList').addEventListener('click', e => { const d = e.target.closest('[data-copyd]'); if (d) return copy(deptMsg(d.dataset.copyd)); const b = e.target.closest('[data-copy]'); if (b) copy(msgFor(A.byId[b.dataset.copy])); });
  $('#btnCopyAll').addEventListener('click', () => {
    const C = codes(); if (!Object.keys(C).length) return A.toast('جهّز الرموز أول');
    copy([...A.T].filter(t => C[t.id]).sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(t => `${short(t.name)}: ${C[t.id]}${isSup(t.id) ? ' (معلم + مشرف)' : ''}`).join('\n') + `\n\nالرابط: ${APP_URL}`);
  });

  // ---------------- حالة الإشعارات عند كل معلم (بالأسماء) ----------------
  function renderPushStats() {
    const box = $('#pushList'); if (!box) return;
    const by = Object.fromEntries(pstat.map(p => [p.tid, p]));
    const WHY = { browser: 'فاتح من المتصفح (لازم يثبّته على الشاشة الرئيسية)', notyet: 'ما ضغط «تفعيل الإشعارات»', denied: 'الإشعارات مقفلة من إعدادات جواله', unsupported: 'نظام جواله قديم أو المتصفح ما يدعم', error: 'تعذّر تسجيل جواله' };
    const on = [], off = [], never = [];
    [...A.T].sort((a, b) => a.name.localeCompare(b.name, 'ar')).forEach(t => { const p = by[t.id]; if (!p) never.push(t); else if (p.ok) on.push([t, p]); else off.push([t, p]); });
    const pl = p => p.platform ? `<small class="pl">${esc(p.platform === 'iPhone' ? 'آيفون' : p.platform === 'Samsung' ? 'سامسونج' : p.platform === 'Android' ? 'أندرويد' : '')}</small>` : '';
    box.innerHTML = `<div class="ps-sum"><span class="ok">✅ مفعّلة: <b>${on.length}</b></span><span class="bad">❌ غير مفعّلة: <b>${off.length}</b></span><span class="nv">⏳ ما فتح التطبيق بعد التحديث: <b>${never.length}</b></span></div>
      ${off.length ? `<h3 class="ps-h">❌ غير مفعّلة — كلّمهم:</h3>` + off.map(([t, p]) => `<div class="ps-row bad"><b>${esc(t.name)}</b>${pl(p)}<span>${esc(WHY[(p.reason || '').split(':')[0]] || p.reason || '')}</span></div>`).join('') : ''}
      ${never.length ? `<h3 class="ps-h">⏳ ما فتح التطبيق من بعد التحديث (17 نوفمبر):</h3><div class="ps-chips">${never.map(t => `<span>${esc(t.name.replace(/^أ\.\s*/, ''))}</span>`).join('')}</div>` : ''}
      ${on.length ? `<h3 class="ps-h">✅ مفعّلة:</h3><div class="ps-chips ok">${on.map(([t, p]) => `<span>${esc(t.name.replace(/^أ\.\s*/, ''))}</span>`).join('')}</div>` : ''}`;
  }

  // ---------------- حالة حارس الإشعارات ----------------
  async function guardStatus() {
    const el = $('#pushStat'); if (!el || S.mode === 'demo') return;
    const g = await S.get('people/_guard').catch(() => null);
    const ok = g && Math.abs(now() - g.at) < 4 * 60e3;
    el.className = 'push-stat ' + (ok ? 'ok' : 'bad');
    el.innerHTML = ok ? `🔔 الإشعارات شغالة ✓ <small>${g.teachers} معلم مفعّل</small>` : `⚠️ الإشعارات متوقفة الحين <small>التطبيق يشتغل عادي — بلّغ المعلمين بالقروب، وكلّم أ. طلال</small>`;
  }
  async function clockCheck() {
    try {
      const t0 = Date.now(), r = await fetch(location.pathname + '?t=' + t0, { method: 'HEAD', cache: 'no-store' }), srv = Date.parse(r.headers.get('date') || '');
      if (!srv) return;
      SKEW = srv - (t0 + Date.now()) / 2;
      if (Math.abs(SKEW) < 3 * 60e3) { SKEW = 0; return; }   // فرق بسيط ما يهم
      if (document.getElementById('clockWarn')) return;
      const h = Math.round(Math.abs(SKEW) / 36e5 * 10) / 10, el = document.createElement('div');
      el.id = 'clockWarn';
      el.setAttribute('style', 'position:sticky;top:0;z-index:999;background:#b4232c;color:#fff;padding:10px 14px;text-align:center;font-weight:700;line-height:1.6');
      el.innerHTML = `⚠️ ساعة هذا الجهاز ${SKEW < 0 ? 'مقدّمة' : 'متأخرة'} ${h} ساعة. صحّحها من إعدادات الجهاز: «التاريخ والوقت تلقائي» والمنطقة الزمنية «البحرين».<br><small style="font-weight:400">التطبيق يصحّح الوقت مؤقتًا، بس لازم تنضبط ساعة الجهاز.</small>`;
      document.body.prepend(el);
      guardStatus();
    } catch (e) { }
  }
  clockCheck();
  guardStatus(); setInterval(guardStatus, 60e3);

  // ---------------- إحصائية التأمين من السحابة (لكل الأجهزة) ----------------
  function renderCloudStats() {
    const box = $('#csTable'); if (!box) return;
    const nd = new Date(now()), iso = A.isoOf(nd);
    const sun = new Date(nd); sun.setDate(nd.getDate() - nd.getDay());
    const from = csRange === 'week' ? A.isoOf(sun) : csRange === 'month' ? iso.slice(0, 8) + '01' : '0000';
    const docs = allDocs.filter(d => d.date >= from && d.date <= iso && d.status !== 'cancelled');
    const per = {}; let refusals = 0;
    const row = id => (per[id] = per[id] || { cover: 0, duty: 0, swap: 0, ok: 0, wait: 0, ref: 0 });
    docs.forEach(d => {
      (d.refused || []).forEach(t => { row(t).ref++; refusals++; });
      if (!d.to || d.status === 'none' || d.status === 'emergency') return;
      const r = row(d.to); r[d.kind === 'duty' ? 'duty' : d.kind === 'swap' ? 'swap' : 'cover']++;
      if (d.status === 'accepted') r.ok++; else if (d.status === 'pending') r.wait++;
    });
    const T = [...A.T].map(t => ({ t, ...(per[t.id] || { cover: 0, duty: 0, swap: 0, ok: 0, wait: 0, ref: 0 }) }));
    T.forEach(x => { x.total = x.cover + x.duty; });
    T.sort((a, b) => b.total - a.total || b.swap - a.swap || a.t.name.localeCompare(b.t.name, 'ar'));
    const tot = T.reduce((n, x) => n + x.total, 0), acc = T.reduce((n, x) => n + x.ok, 0), mx = Math.max(1, ...T.map(x => x.total));
    $('#csKpis').innerHTML = `<div class="kpi"><b>${tot}</b><span>حصة تأمين ومراقبة</span></div><div class="kpi"><b>${T.filter(x => x.total).length}</b><span>معلم أمّن</span></div><div class="kpi"><b>${tot ? Math.round(acc / Math.max(1, T.reduce((n, x) => n + x.ok + x.wait, 0)) * 100) : 0}%</b><span>نسبة الاستلام</span></div><div class="kpi"><b>${refusals}</b><span>اعتذار</span></div>`;
    box.innerHTML = `<table class="cs"><thead><tr><th>المعلم</th><th>القسم</th><th>تأمين</th><th>مراقبة</th><th>تبديل</th><th>اعتذار</th><th class="bar-h">النسبة</th></tr></thead><tbody>` +
      T.map(x => `<tr class="${x.total ? '' : 'zero'}"><td><b>${esc(x.t.name)}</b></td><td class="muted">${esc(x.t.dept || '')}</td><td>${x.cover || '–'}</td><td>${x.duty || '–'}</td><td>${x.swap || '–'}</td><td>${x.ref || '–'}</td><td class="bar-c"><span class="bar"><i style="width:${Math.round(x.total / mx * 100)}%"></i></span><small>${tot ? Math.round(x.total / tot * 100) : 0}%</small></td></tr>`).join('') + '</tbody></table>';
  }
  $('#csRange').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; csRange = b.dataset.r; $('#csRange').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderCloudStats(); });

  // ---------------- ملخص اليوم لقروب الواتساب ----------------
  const waHTML = t => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(https:\/\/\S+)/g, '<u dir="ltr">$1</u>').replace(/\n/g, '<br>');
  const refreshPrev = () => { const el = $('#waPrev'); if (!el) return; const t = A.groupText(); el.innerHTML = t ? waHTML(t) : '<span class="muted">ما فيه تأمين أو تبديل في هذا اليوم.</span>'; };
  document.addEventListener('apt:day', refreshPrev);
  $('#waPrevBox').addEventListener('toggle', refreshPrev);
  const copyGroup = async () => {
    const t = A.groupText();
    if (!t) return A.toast('ما فيه تأمين أو تبديل في هذا اليوم');
    try { await navigator.clipboard.writeText(t); A.toast('انسخ ✓ — الصقه في قروب المعلمين'); }
    catch (e) { prompt('انسخ الملخص:', t); }
    if (!sentDays()[A.date]) A.toast('تنبيه: هذا اليوم ما انرسل للتطبيق للحين — اضغط «إرسال للمعلمين» عشان يقدرون يستلمون');
  };
  $('#btnGroup').addEventListener('click', copyGroup);
  document.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', copyGroup));

  // ---------------- تنبيهات واضحة: اعتذار، طلب رجوع، تراجع ----------------
  const ALERT = { rejected: ['⚠', 'اعتذار من'], withdrew: ['⚠', 'اعتذار بعد الاستلام من'], askback: ['⭐', 'طلب رجوع للتكليف من'], returned: ['✓', 'تراجع عن اعتذاره وسيحضر:'] };
  const seenA = (() => { try { return new Set(JSON.parse(localStorage.getItem('apt-admin-seen') || '[]')); } catch (e) { return new Set(); } })();
  const saveSeen = () => { try { localStorage.setItem('apt-admin-seen', JSON.stringify([...seenA].slice(-500))); } catch (e) { } };
  S.watch('assign', null, list => {
    const today = todayISO();
    allDocs = list; renderCloudStats();
    const fresh = [];
    alerts = [];
    for (const d of list) {
      if (d.date < today || d.status === 'cancelled') continue;
      for (const l of d.log || []) {
        if (!ALERT[l.act]) continue;
        const k = `${d.id}|${l.at}`;
        if (seenA.has(k)) continue;
        alerts.push({ k, d, l });
        if (alertsReady) fresh.push({ d, l });
      }
    }
    alerts.sort((a, b) => b.l.at - a.l.at);
    renderAlerts(); badge();
    fresh.forEach(({ d, l }) => {
      const t = `${ALERT[l.act][1]} ${l.name}`, body = `${d.slotName} ${d.c || ''} — ${A.weekdayName(d.date)}${l.note ? ' — ' + l.note : ''}`;
      A.toast(`${t} — ${d.slotName}`);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification(t, { body, lang: 'ar', dir: 'rtl', tag: d.id }); } catch (e) { }
    });
    alertsReady = true;
  });
  function renderAlerts() {
    const el = $('#appAlerts');
    const pq = reqs.filter(q => q.status === 'pending');
    el.hidden = !alerts.length && !pq.length;
    el.innerHTML = pq.slice(0, 3).map(q => q.type === 'absreq' ? `<div class="al al-req"><div class="al-t">✉ طلب تأمين حصص (غياب بعذر رسمي) من <b>${esc(q.name)}</b> — ${esc(A.weekdayName(q.date))} ${esc(A.fmtG(q.date))}، الحصص: ${q.full ? 'اليوم كامل' : q.slots.map(PER).join('، ')}</div>
        <div class="al-n">العذر: ${esc(q.kindTxt || '')}${q.reason ? ' — «' + esc(q.reason) + '»' : ''}</div>
        <div class="al-b"><button class="btn sm primary" data-ab-ok="${q.id}">✓ اعتماد وتوزيع حصصه</button><button class="btn sm" data-rq-no="${q.id}">اعتذار</button></div></div>` : `<div class="al al-req"><div class="al-t">⇄ طلب تبديل من <b>${esc(q.name)}</b> — ${esc(A.weekdayName(q.date))} ${esc(A.fmtG(q.date))}، الحصص: ${q.slots.map(PER).join('، ')}</div>
        <div class="al-n">السبب: «${esc(q.reason)}»${q.prefer ? ` · يقترح: ${esc(q.prefer)}` : ''}</div>
        <div class="al-b"><button class="btn sm primary" data-rq-auto="${q.id}">⚡ تبديل تلقائي</button><button class="btn sm" data-rq-manual="${q.id}">✋ أرتبه بنفسي</button><button class="btn sm" data-rq-no="${q.id}">اعتذار</button></div></div>`).join('') + alerts.slice(0, 6).map(({ k, d, l }) => {
      const where = d.kind === 'duty' ? `${esc(d.slotName)} — ${esc(d.label.replace('مراقبة — ', ''))}` : `الحصة ${esc(d.slotName)}${d.c ? ' (' + code(d.c) + ')' : ''}`;
      const now2 = d.to ? `التكليف الحين عند <b>${esc(d.toName)}</b> ${d.status === 'accepted' ? '(استلم ✓)' : '(بانتظار استلامه)'}` : d.emg ? `تؤمّنها الإدارة: <b>${esc(d.emg)}</b>` : '<b class="bad-t">ما فيه مؤمّن — يحتاج قرارك</b>';
      return `<div class="al al-${l.act}"><div class="al-t">${ALERT[l.act][0]} ${ALERT[l.act][1]} <b>${esc(l.name)}</b> — ${KIND[d.kind]}، ${where}، ${esc(A.weekdayName(d.date))} ${esc(A.fmtG(d.date))}</div>
        ${l.note ? `<div class="al-n">العذر: «${esc(l.note)}»</div>` : ''}<div class="al-n">${now2}</div>
        <div class="al-b"><button class="btn sm primary" data-al-go="${d.date}">اتخذ قرار</button><button class="btn sm" data-al-seen="${esc(k)}">تم الاطلاع</button></div></div>`;
    }).join('') + (alerts.length > 6 ? `<p class="hint">و${alerts.length - 6} تنبيهات ثانية في «ردود المعلمين».</p>` : '');
  }
  $('#appAlerts').addEventListener('click', e => {
    const s2 = e.target.closest('[data-al-seen]'), g = e.target.closest('[data-al-go]');
    if (s2) { seenA.add(s2.dataset.alSeen); saveSeen(); alerts = alerts.filter(a => a.k !== s2.dataset.alSeen); renderAlerts(); badge(); }
    if (g) {
      if (g.dataset.alGo !== A.date) { $('#dateInput').value = g.dataset.alGo; $('#dateInput').dispatchEvent(new Event('change')); }
      document.querySelector('.tab[data-tab="app"]').click();
      setTimeout(() => $('#respList').scrollIntoView({ behavior: 'smooth' }), 200);
    }
  });
  // نطلب إذن تنبيهات المتصفح أول ما يرسل
  document.addEventListener('click', e => { if (e.target.closest('[data-send-now], #btnSend') && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { }); });

  // ---------------- الشارة ----------------
  function badge() {
    const n = msgs.filter(m => m.from === 'teacher' && !m.readA).length + exps.filter(x => x.reply && !x.seenA).length + alerts.length + reqs.filter(q => q.status === 'pending').length;
    const el = $('#appBadge'); el.hidden = !n; el.textContent = n;
  }

  watchDay(); renderSend(); renderLinks();
})();
