(() => {
  'use strict';

  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const SLOT_ORDER = ['1', '2', '3', 'B', '4', '5', '6', '7'];
  const TEACH_SLOTS = SLOT_ORDER.filter(s => s !== 'B');
  const SLOT_NAME = { '1': 'الأولى', '2': 'الثانية', '3': 'الثالثة', 'B': 'الفسحة', '4': 'الرابعة', '5': 'الخامسة', '6': 'السادسة', '7': 'السابعة' };
  const NON_TEACHING = new Set(['مراقبة', 'اجتماع القسم', 'اجتماع التحسين', 'مشرف متابع']);
  const STORE = 'ap-taameen-v1';
  const slotIdx = s => SLOT_ORDER.indexOf(s);

  const T = window.TIMETABLE.teachers;
  const byId = Object.fromEntries(T.map(t => [t.id, t]));
  const deptOrder = [...new Set(T.map(t => t.dept))];
  T.forEach(t => { t.teaching = Object.values(t.cells).filter(c => !NON_TEACHING.has(c.t)).length; });

  // ---------------- التخزين ----------------
  const defaults = () => ({
    settings: { principal: '', assistant: '', maxPerDay: 1, deptFirst: true, coverBreak: true, avoidConsec: true },
    avail: {},     // tid -> {released, days}
    history: {}    // 'YYYY-MM-DD' -> {absent:{tid:[slots]}, rows:[], swaps:[], savedAt}
  });
  let db = defaults();
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const p = JSON.parse(raw);
      db = { ...db, ...p, settings: { ...db.settings, ...(p.settings || {}) } };
      // دمج المسودات من النسخة السابقة
      if (p.drafts) { Object.assign(db.history, p.drafts); delete db.drafts; }
    }
  } catch (e) { /* يبدأ فاضي */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { toast('تعذّر الحفظ في المتصفح'); } };

  const availOf = t => db.avail[t.id] || { released: t.teaching === 0, days: t.days.slice() };
  const presentOn = (t, d) => { const a = availOf(t); return !a.released && a.days.includes(d); };

  // ---------------- أدوات ----------------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // رمز الصف مثل 2ع3 يُعرض حرفًا حرفًا بنفس ترتيب الجدول الأصلي
  const codeHTML = c => c ? c.split(' / ').map(x => `<span class="code">${[...x].map(ch => `<i>${esc(ch)}</i>`).join('')}</span>`).join(' / ') : '<span class="muted">—</span>';
  const arNum = n => Number(n).toLocaleString('ar-EG');
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayIdx = iso => { const w = parseISO(iso).getDay(); return w <= 4 ? w : -1; };
  const fmtG = iso => { const d = parseISO(iso); return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}م`; };
  const gHTML = iso => { const d = parseISO(iso); return `<bdi dir="ltr">${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}</bdi>م`; };
  const fmtH = iso => {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseISO(iso)); }
    catch (e) { return ''; }
  };
  const weekdayName = iso => new Intl.DateTimeFormat('ar', { weekday: 'long' }).format(parseISO(iso));
  const sortKey = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const nm = id => byId[id] ? byId[id].name : id;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  // نافذة تأكيد داخل الصفحة (بدل confirm)
  function ask(msg, okText = 'نعم') {
    return new Promise(res => {
      $('#modalMsg').textContent = msg; $('#modalOk').textContent = okText; $('#modal').hidden = false; $('#modalOk').focus();
      const done = v => { $('#modal').hidden = true; $('#modalOk').onclick = $('#modalNo').onclick = null; res(v); };
      $('#modalOk').onclick = () => done(true); $('#modalNo').onclick = () => done(false);
    });
  }

  // تنزيل ملف: قدرة التنزيل داخل Claude، وإلا رابط عادي
  const claudeHost = !!(window.claude && window.claude.use);
  const dlPromise = claudeHost ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  async function saveFile(filename, blob, plainName = filename) {
    const dl = await dlPromise;
    if (dl) {
      try { await dl.save({ filename, data: blob }); toast('تم التنزيل'); }
      catch (e) { if (e && e.code !== 'declined') toast('تعذّر التنزيل هنا'); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = plainName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------- حالة اليوم ----------------
  let date = isoOf(new Date());
  let state = emptyDay();
  function emptyDay() { return { absent: {}, rows: [], swaps: [] }; }
  const D = () => dayIdx(date);

  function loadDate(iso) {
    date = iso;
    const src = db.history[iso];
    state = src ? JSON.parse(JSON.stringify({ absent: src.absent || {}, rows: src.rows || [], swaps: src.swaps || [] })) : emptyDay();
    renderAll();
  }
  // الحفظ تلقائي مع كل تغيير
  function commit() {
    const has = Object.keys(state.absent).length || state.swaps.length;
    if (has) db.history[date] = { ...JSON.parse(JSON.stringify(state)), savedAt: new Date().toISOString() };
    else delete db.history[date];
    persist();
    $('#savedFlag').hidden = !has;
  }

  // ---------------- الجدول الفعلي لليوم (بعد التبديلات) ----------------
  function context(st = state, skipItem = null) {
    const d = D();
    const ov = new Map();   // "tid|slot" -> cell أو null
    const out = new Map();  // tid -> Set(slots) خارج المدرسة (استئذان)
    for (const sw of st.swaps) {
      out.set(sw.a, new Set([...(out.get(sw.a) || []), ...sw.slots]));
      for (const it of sw.items) {
        if (it === skipItem || !it.b) continue;
        ov.set(`${sw.a}|${it.s}`, null);
        ov.set(`${sw.a}|${it.s2}`, { c: it.c, t: it.t, swap: true });
        ov.set(`${it.b}|${it.s2}`, null);
        ov.set(`${it.b}|${it.s}`, { c: it.c, t: it.t2, swap: true });
      }
    }
    const cell = (tid, s) => { const k = `${tid}|${s}`; return ov.has(k) ? ov.get(k) : byId[tid].cells[`${d}-${s}`] || null; };
    const isOut = (tid, s) => !!(out.get(tid) && out.get(tid).has(s));
    const absentSet = new Set(Object.keys(st.absent));
    return { d, cell, isOut, absentSet };
  }
  const dayCells = (ctx, tid) => SLOT_ORDER.map(s => ({ s, cell: ctx.cell(tid, s) })).filter(x => x.cell);
  const coverable = cell => !NON_TEACHING.has(cell.t) || (cell.t === 'مراقبة' && db.settings.coverBreak);

  // ---------------- العدّ من السجل ----------------
  function historyCounts(excludeDate) {
    const cnt = {}, abs = {}, last = {}, swA = {}, swB = {};
    for (const [iso, h] of Object.entries(db.history)) {
      if (iso === excludeDate) continue;
      for (const r of h.rows || []) if (r.sub) { cnt[r.sub] = (cnt[r.sub] || 0) + 1; if (!last[r.sub] || iso > last[r.sub]) last[r.sub] = iso; }
      for (const tid of Object.keys(h.absent || {})) abs[tid] = (abs[tid] || 0) + 1;
      for (const sw of h.swaps || []) {
        swA[sw.a] = (swA[sw.a] || 0) + 1;
        for (const it of sw.items) if (it.b) swB[it.b] = (swB[it.b] || 0) + 1;
      }
    }
    return { cnt, abs, last, swA, swB };
  }

  // ---------------- التبديل ----------------
  // خيارات التبديل لحصة المعلم a في الحصة s: زميل يدرّس نفس الصف في نفس اليوم
  function swapOptions(sw, it, hist) {
    const ctx = context(state, it);
    const a = sw.a;
    const opts = [];
    for (const b of T) {
      if (b.id === a || !presentOn(b, ctx.d) || ctx.absentSet.has(b.id)) continue;
      if (ctx.cell(b.id, it.s) || ctx.isOut(b.id, it.s)) continue; // البديل لازم يكون فاضي وقت حصة صاحب الطلب
      for (const s2 of TEACH_SLOTS) {
        if (s2 === it.s || sw.slots.includes(s2)) continue;
        const bc = ctx.cell(b.id, s2);
        if (!bc || bc.swap || NON_TEACHING.has(bc.t) || bc.c !== it.c) continue;
        if (ctx.cell(a, s2) || ctx.isOut(b.id, s2)) continue;     // صاحب الطلب فاضي وقتها
        opts.push({ b: b.id, s2, t2: bc.t, key: [hist.swB[b.id] || 0, Math.abs(slotIdx(s2) - slotIdx(it.s)), b.teaching] });
      }
    }
    return opts.sort((x, y) => sortKey(x.key, y.key) || nm(x.b).localeCompare(nm(y.b), 'ar'));
  }
  function resolveSwaps() {
    const hist = historyCounts(date);
    for (const sw of state.swaps) {
      for (const it of sw.items) {
        const opts = swapOptions(sw, it, hist);
        const ok = it.b && opts.find(o => o.b === it.b && o.s2 === it.s2);
        if (ok) { it.t2 = ok.t2; continue; }
        if (it.b && it.m) it.m = false;   // اختيار يدوي صار غير ممكن
        if (it.none) { it.b = ''; continue; }
        const best = opts[0];
        Object.assign(it, best ? { b: best.b, s2: best.s2, t2: best.t2 } : { b: '', s2: '', t2: '' });
      }
    }
  }

  // ---------------- التأمين ----------------
  function needs(ctx) {
    const list = [];
    for (const [tid, slots] of Object.entries(state.absent)) {
      for (const { s, cell } of dayCells(ctx, tid)) if (slots.includes(s) && coverable(cell)) list.push({ slot: s, c: cell.c, t: cell.t, absent: tid, kind: 'abs' });
    }
    for (const sw of state.swaps) {
      if (ctx.absentSet.has(sw.a)) continue;
      for (const it of sw.items) if (!it.b) list.push({ slot: it.s, c: it.c, t: it.t, absent: sw.a, kind: 'out' });
    }
    return list;
  }

  function runAfter(ctx, tid, s, extra) {
    const teach = new Set(TEACH_SLOTS.filter(x => ctx.cell(tid, x)));
    extra.forEach(x => teach.add(x)); teach.add(s);
    let best = 0, run = 0;
    for (const x of SLOT_ORDER) {
      if (x === 'B') { run = 0; continue; }
      run = teach.has(x) ? run + 1 : 0; best = Math.max(best, run);
    }
    return best;
  }

  function candidates(row, rows, hist, ctx) {
    const s = row.slot;
    const absT = byId[row.absent];
    const taken = new Set(rows.filter(r => r !== row && r.slot === s && r.sub).map(r => r.sub));
    const tc = {}, extra = {};
    rows.forEach(r => { if (r !== row && r.sub) { tc[r.sub] = (tc[r.sub] || 0) + 1; (extra[r.sub] = extra[r.sub] || []).push(r.slot); } });
    const list = T.filter(t => presentOn(t, ctx.d) && !ctx.absentSet.has(t.id) && !ctx.isOut(t.id, s) && !ctx.cell(t.id, s) && !taken.has(t.id));
    const minHist = list.length ? Math.min(...list.map(t => hist.cnt[t.id] || 0)) : 0;
    return list.map(t => {
      const h = hist.cnt[t.id] || 0, n = tc[t.id] || 0, same = t.dept === absT.dept;
      const load = dayCells(ctx, t.id).filter(x => !NON_TEACHING.has(x.cell.t)).length;
      const run = s === 'B' ? 0 : runAfter(ctx, t.id, s, (extra[t.id] || []).filter(x => x !== 'B'));
      const over = n >= db.settings.maxPerDay;
      const deptTier = db.settings.deptFirst && same && h - minHist <= 2 ? 0 : 1;
      const consec = db.settings.avoidConsec && run >= 3 ? 1 : 0;
      return { t, h, n, same, load, run, over, key: [over ? 1 : 0, n, consec, deptTier, h, load, t.total] };
    }).sort((a, b) => sortKey(a.key, b.key) || a.t.name.localeCompare(b.t.name, 'ar'));
  }

  // يعيد بناء جدول التأمين: يحافظ على الاختيارات اليدوية الصالحة ويوزّع الباقي
  function recompute(resetManual = false) {
    if (D() === -1) return;
    resolveSwaps();
    const ctx = context();
    const hist = historyCounts(date);
    const prev = new Map(state.rows.map(r => [`${r.absent}|${r.slot}`, r]));
    const rows = needs(ctx).map(n => {
      const old = prev.get(`${n.absent}|${n.slot}`);
      return { ...n, sub: !resetManual && old && old.m ? old.sub : '', m: !resetManual && old ? !!old.m : false };
    });
    // تحقق من صلاحية اليدوي
    rows.filter(r => r.m).forEach(r => { if (r.sub && !candidates(r, rows, hist, ctx).some(c => c.t.id === r.sub)) { r.sub = ''; r.m = false; } });
    const pending = rows.filter(r => !r.m);
    pending.forEach(r => { r.sub = ''; });
    while (pending.length) {
      pending.forEach(r => { r._n = candidates(r, rows, hist, ctx).filter(c => !c.over).length; });
      pending.sort((a, b) => a._n - b._n || slotIdx(a.slot) - slotIdx(b.slot));
      const r = pending.shift();
      const best = candidates(r, rows, hist, ctx).find(c => !c.over);
      r.sub = best ? best.t.id : '';
    }
    rows.forEach(r => delete r._n);
    state.rows = rows;
    commit();
  }

  // ---------------- العرض: المشترك ----------------
  function renderHeroDate() {
    const now = isoOf(new Date());
    $('#heroDate').innerHTML = `<small>اليوم</small><b>${esc(weekdayName(now))}</b><small>${gHTML(now)} · ${esc(fmtH(now))}</small>`;
  }
  function renderDate() {
    $('#dateInput').value = date;
    $('#dayInfo').innerHTML = `${esc(weekdayName(date))}<small>${gHTML(date)} — ${esc(fmtH(date))}</small>`;
    $('#savedFlag').hidden = !db.history[date];
    const we = D() === -1;
    $('#weekendMsg').hidden = !we;
    $('#dayWork').hidden = we; $('#swapWork').hidden = we;
  }
  function renderAll() {
    renderDate();
    if (D() === -1) return;
    renderAbsList(); renderAbsDetail(); renderResults(); renderSwapForm(); renderSwaps();
  }

  // ---------------- العرض: الغياب ----------------
  function renderAbsList() {
    const d = D(), ctx = context();
    const q = $('#absSearch').value.trim();
    $('#absList').innerHTML = deptOrder.map(dep => {
      const ts = T.filter(t => t.dept === dep && (!q || t.name.includes(q)));
      if (!ts.length) return '';
      return `<div class="dept"><h3>${esc(dep)}</h3><div class="chips">${ts.map(t => {
        const on = !!state.absent[t.id];
        if (!presentOn(t, d)) {
          const why = availOf(t).released ? 'مفرّغ' : 'غير متواجد اليوم';
          return `<span class="chip off" title="${why}">${esc(t.name)} <span class="tag">${why}</span></span>`;
        }
        const n = dayCells(ctx, t.id).filter(x => coverable(x.cell)).length;
        return `<button class="chip ${on ? 'on' : ''}" data-abs="${t.id}" aria-pressed="${on}">${esc(t.name)} <span class="tag">${arNum(n)} حصة</span></button>`;
      }).join('')}</div></div>`;
    }).join('') || '<p class="muted">لا يوجد نتائج</p>';
  }

  function renderAbsDetail() {
    const ctx = context();
    const ids = Object.keys(state.absent);
    $('#absDetail').hidden = !ids.length;
    const outN = state.rows.filter(r => r.kind === 'out').length;
    const absN = state.rows.length - outN;
    $('#needNote').textContent = ids.length || outN
      ? `${arNum(ids.length)} غائب · ${arNum(absN)} حصة تأمين${outN ? ` · ${arNum(outN)} حصة استئذان بدون تبديل` : ''}`
      : 'اختر الغائبين، والتأمين يتوزّع تلقائيًا.';
    $('#absSlots').innerHTML = ids.map(id => {
      const t = byId[id];
      const pills = dayCells(ctx, id).map(({ s, cell }) => {
        if (!coverable(cell)) return `<span class="pill na" title="لا تحتاج تأمين">${SLOT_NAME[s]}<small>${esc(cell.t)}</small></span>`;
        const on = state.absent[id].includes(s);
        return `<button class="pill ${on ? 'on' : ''}" data-pill="${id}" data-s="${s}" aria-pressed="${on}">${SLOT_NAME[s]}<small>${cell.c ? codeHTML(cell.c) + ' ' : ''}${esc(cell.t)}</small></button>`;
      }).join('');
      return `<div class="abs-block"><header><div><b>${esc(t.name)}</b> <small>· ${esc(t.dept)}</small></div><div><button class="link" data-all="${id}">كل الحصص</button><button class="link" data-rm="${id}">إلغاء الغياب</button></div></header><div class="slot-pills">${pills || '<span class="muted">ما عنده حصص اليوم</span>'}</div></div>`;
    }).join('');
  }

  // مجموعات حسب المعلم الغائب
  function groupRows(rows) {
    const g = new Map();
    rows.forEach((r, i) => {
      const k = `${r.absent}|${r.kind}`;
      if (!g.has(k)) g.set(k, { absent: r.absent, kind: r.kind, rows: [] });
      g.get(k).rows.push({ r, i });
    });
    const arr = [...g.values()];
    arr.forEach(x => x.rows.sort((a, b) => slotIdx(a.r.slot) - slotIdx(b.r.slot)));
    return arr.sort((a, b) => slotIdx(a.rows[0].r.slot) - slotIdx(b.rows[0].r.slot));
  }

  function renderResults() {
    const rows = state.rows;
    $('#resultCard').hidden = !rows.length;
    if (!rows.length) { $('#loadToday').innerHTML = ''; return; }
    const hist = historyCounts(date), ctx = context();
    const body = groupRows(rows).map(g => {
      const head = `<tr class="grp"><td colspan="4"><b>${esc(nm(g.absent))}</b> <span class="badge ${g.kind === 'out' ? 'other' : 'none'}">${g.kind === 'out' ? 'مستأذن' : 'غائب'}</span> <small class="muted">· ${esc(byId[g.absent].dept)} · ${arNum(g.rows.length)} حصة</small></td></tr>`;
      return head + g.rows.map(({ r, i }) => {
        const cands = candidates(r, rows, hist, ctx);
        const opts = cands.map(c => {
          const note = [c.same ? 'نفس القسم' : c.t.dept, `أمّن ${arNum(c.h)}`, `${arNum(c.load)} حصص اليوم`, c.over ? '⚠ تجاوز الحد' : '', c.run >= 3 ? `⚠ ${arNum(c.run)} متتالية` : ''].filter(Boolean).join(' · ');
          return `<option value="${c.t.id}" ${c.t.id === r.sub ? 'selected' : ''}>${esc(c.t.name)} — ${esc(note)}</option>`;
        }).join('');
        const cur = cands.find(c => c.t.id === r.sub);
        const badge = !r.sub ? '<span class="badge none">بدون مؤمِّن</span>' : cur && cur.same ? '<span class="badge dept">من القسم</span>' : '<span class="badge other">من قسم آخر</span>';
        return `<tr class="${r.sub ? '' : 'missing'}">
          <td class="per" data-l="الحصة">${SLOT_NAME[r.slot]}</td>
          <td data-l="الصف">${codeHTML(r.c)}</td>
          <td data-l="المادة">${esc(r.t)}</td>
          <td data-l="المؤمِّن"><select data-row="${i}" aria-label="المعلم المؤمِّن"><option value="">— بدون تأمين —</option>${opts}</select><span class="why">${badge}${r.m ? ' <span class="badge dept">يدوي</span>' : ''}</span></td>
        </tr>`;
      }).join('');
    }).join('');
    $('#resTable').innerHTML = `<thead><tr><th>الحصة</th><th>الصف</th><th>المادة</th><th>المعلم المؤمِّن</th></tr></thead><tbody>${body}</tbody>`;
    const cnt = {};
    rows.forEach(r => { if (r.sub) cnt[r.sub] = (cnt[r.sub] || 0) + 1; });
    const lt = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<span class="lt">${esc(nm(id))} <b>${arNum(n)}</b></span>`).join('');
    $('#loadToday').innerHTML = lt ? `<span class="muted lt-label">عبء اليوم:</span>${lt}` : '';
  }

  // ---------------- العرض: التبديل ----------------
  let swDraft = { a: '', from: '', pick: [] };
  function renderSwapForm() {
    const ctx = context();
    const busyA = new Set(state.swaps.map(s => s.a));
    const opts = deptOrder.map(dep => {
      const ts = T.filter(t => t.dept === dep && presentOn(t, ctx.d) && !ctx.absentSet.has(t.id) && !busyA.has(t.id));
      return ts.length ? `<optgroup label="${esc(dep)}">${ts.map(t => `<option value="${t.id}" ${t.id === swDraft.a ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    if (swDraft.a && (busyA.has(swDraft.a) || ctx.absentSet.has(swDraft.a))) swDraft.a = '';
    $('#swTeacher').innerHTML = `<option value="">— اختر المعلم —</option>${opts}`;
    $('#swTeacher').value = swDraft.a;
    const a = swDraft.a;
    $('#swModeWrap').hidden = !a;
    $('#btnSwap').disabled = !a || !swSlots().length;
    if (!a) return;
    const teach = dayCells(ctx, a).filter(x => !NON_TEACHING.has(x.cell.t));
    $('#swFrom').innerHTML = TEACH_SLOTS.map(s => `<option value="${s}" ${s === swDraft.from ? 'selected' : ''}>${SLOT_NAME[s]}</option>`).join('');
    if (!swDraft.from) { swDraft.from = teach.length ? teach[teach.length - 1].s : '7'; $('#swFrom').value = swDraft.from; }
    const mode = document.querySelector('input[name=swMode]:checked').value;
    $('#swPills').hidden = mode !== 'pick';
    $('#swPills').innerHTML = teach.map(({ s, cell }) => `<button class="pill ${swDraft.pick.includes(s) ? 'on' : ''}" data-swp="${s}">${SLOT_NAME[s]}<small>${codeHTML(cell.c)} ${esc(cell.t)}</small></button>`).join('') || '<span class="muted">ما عنده حصص تدريس اليوم</span>';
  }
  function swSlots() {
    const a = swDraft.a; if (!a) return [];
    const ctx = context();
    const teach = dayCells(ctx, a).filter(x => !NON_TEACHING.has(x.cell.t)).map(x => x.s);
    const mode = document.querySelector('input[name=swMode]:checked').value;
    if (mode === 'pick') return teach.filter(s => swDraft.pick.includes(s));
    const fi = slotIdx(swDraft.from || '7');
    return teach.filter(s => slotIdx(s) >= fi);
  }
  // كل الحصص (حتى غير التدريسية) في وقت الخروج
  function swWindow() {
    const mode = document.querySelector('input[name=swMode]:checked').value;
    if (mode === 'pick') return swSlots();
    const fi = slotIdx(swDraft.from || '7');
    return SLOT_ORDER.filter(s => slotIdx(s) >= fi);
  }

  function renderSwaps() {
    $('#swapBar').hidden = !state.swaps.length;
    const hist = historyCounts(date);
    $('#swapList').innerHTML = state.swaps.map((sw, si) => {
      const when = sw.mode === 'from' ? `يطلع من الحصة ${SLOT_NAME[sw.from]}` : 'حصص محددة';
      const rows = sw.items.map((it, ii) => {
        const opts = swapOptions(sw, it, hist).map(o => `<option value="${o.b}|${o.s2}" ${o.b === it.b && o.s2 === it.s2 ? 'selected' : ''}>${esc(nm(o.b))}</option>`).join('');
        const sel = `<select data-sw="${si}" data-it="${ii}" aria-label="من يدخل الحصة ${SLOT_NAME[it.s]}"><option value="">— للتأمين —</option>${opts}</select>`;
        const first = `<tr class="${it.b ? 'pair-a' : 'missing'}"><td rowspan="${it.b ? 2 : 1}" data-l="الصف">${codeHTML(it.c)}</td><td class="per" data-l="الحصة">${SLOT_NAME[it.s]}</td><td data-l="المعلم">${sel}</td></tr>`;
        const second = it.b ? `<tr class="pair-b"><td class="per" data-l="الحصة">${SLOT_NAME[it.s2]}</td><td data-l="المعلم"><b>${esc(nm(sw.a))}</b></td></tr>` : '';
        return first + second;
      }).join('');
      return `<div class="card"><div class="card-head"><h2>${esc(nm(sw.a))}</h2><button class="btn danger" data-swdel="${si}">إلغاء الطلب</button></div>
        <p class="hint">${when}${sw.reason ? ` · ${esc(sw.reason)}` : ''}${sw.items.length ? '' : ' · ما عنده حصص في هالوقت'}</p>
        ${sw.items.length ? `<div class="table-wrap"><table class="res-table swap-table"><thead><tr><th>الصف</th><th>الحصة</th><th>المعلم</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}</div>`;
    }).join('') || '<div class="card empty"><strong>ما فيه طلبات تبديل لهذا اليوم</strong></div>';
  }

  // ---------------- كشف الطباعة / PDF ----------------
  const SHEETS = {
    cover: { title: 'كشف تأمين الحصص', file: 'كشف-التأمين', plain: 'taameen', empty: 'ما فيه حصص تأمين لهذا اليوم' },
    swap: { title: 'كشف تبديل الحصص', file: 'كشف-التبديل', plain: 'tabdeel', empty: 'ما فيه تبديلات لهذا اليوم' }
  };
  const hasContent = (data, kind) => kind === 'swap' ? (data.swaps || []).some(sw => sw.items.some(it => it.b)) : (data.rows || []).length > 0;

  function buildSheet(iso, data, kind) {
    const s = db.settings;
    let body = '', note = '';
    if (kind === 'cover') {
      let n = 0;
      const tbody = groupRows(data.rows || []).map(g => `<tr class="ps-grp"><td colspan="6">${g.kind === 'out' ? 'المعلم المستأذن' : 'المعلم الغائب'}: <b>${esc(nm(g.absent))}</b> — ${esc(byId[g.absent].dept)}</td></tr>` +
        g.rows.map(({ r }) => `<tr><td>${arNum(++n)}</td><td>${SLOT_NAME[r.slot]}</td><td>${r.c ? codeHTML(r.c) : '—'}</td><td>${esc(r.t)}</td>
          <td class="nm">${r.sub ? esc(nm(r.sub)) : '................................'}</td><td class="sig"></td></tr>`).join('')).join('');
      body = `<table class="ps-table">
        <thead><tr><th style="width:6%">م</th><th style="width:11%">الحصة</th><th style="width:10%">الصف</th><th style="width:15%">المادة</th><th>المعلم المؤمِّن</th><th style="width:26%">التوقيع بالعلم</th></tr></thead>
        <tbody>${tbody}</tbody></table>`;
      note = 'نأمل من المعلمين الأفاضل التوقيع بالعلم، والتواجد في الصف بداية الحصة. شاكرين تعاونكم.';
    } else {
      let m = 0;
      const tbody = (data.swaps || []).flatMap(sw => sw.items.filter(it => it.b).map(it => {
        const [p1, p2] = slotIdx(it.s2) < slotIdx(it.s) ? [[it.s2, sw.a], [it.s, it.b]] : [[it.s, it.b], [it.s2, sw.a]];
        return `<tr class="pair"><td rowspan="2">${arNum(++m)}</td><td rowspan="2">${codeHTML(it.c)}</td><td>${SLOT_NAME[p1[0]]}</td><td class="nm">${esc(nm(p1[1]))}</td><td class="sig"></td></tr>
          <tr><td>${SLOT_NAME[p2[0]]}</td><td class="nm">${esc(nm(p2[1]))}</td><td class="sig"></td></tr>`;
      })).join('');
      body = `<table class="ps-table">
        <thead><tr><th style="width:6%">م</th><th style="width:10%">الصف</th><th style="width:14%">الحصة</th><th>المعلم</th><th style="width:26%">التوقيع</th></tr></thead>
        <tbody>${tbody}</tbody></table>`;
      note = '';
    }
    $('#printSheet').innerHTML = `
      <div class="ps-head"><img src="assets/header.jpg" alt=""></div>
      <h1 class="ps-title">${SHEETS[kind].title}</h1>
      <div class="ps-meta"><span>اليوم: <b>${esc(weekdayName(iso))}</b></span><span>التاريخ: <b>${gHTML(iso)}</b></span><span>الموافق: <b>${esc(fmtH(iso))}</b></span></div>
      ${body}
      ${note ? `<p class="ps-note">${note}</p>` : ''}
      <div class="ps-foot">
        <div><div class="role">المدير المساعد</div><div class="pname">${esc(s.assistant)}</div><div class="sigline">التوقيع</div></div>
        <div><div class="role">مدير المدرسة</div><div class="pname">${esc(s.principal)}</div><div class="sigline">التوقيع</div></div>
      </div>`;
  }

  function printDay(iso, data, kind = 'cover') {
    if (!hasContent(data, kind)) { toast(SHEETS[kind].empty); return; }
    buildSheet(iso, data, kind);
    const old = document.title;
    document.title = `${SHEETS[kind].title} ${weekdayName(iso)} ${fmtG(iso)}`;
    const img = $('#printSheet img');
    const go = () => { window.print(); document.title = old; };
    if (img.complete) go(); else img.onload = img.onerror = go;
  }

  let pdfBusy = false;
  async function pdfDay(iso, data, btn, kind = 'cover') {
    if (!hasContent(data, kind)) { toast(SHEETS[kind].empty); return; }
    if (pdfBusy) return;
    pdfBusy = true;
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'جاري التجهيز…'; }
    const sheet = $('#printSheet');
    try {
      buildSheet(iso, data, kind);
      sheet.classList.add('render');
      const img = sheet.querySelector('img');
      if (!img.complete) await new Promise(r => { img.onload = img.onerror = r; });
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const SCALE = 2;
      const canvas = await window.html2canvas(sheet, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false });
      // نقاط القص بين الصفوف حتى ما ينقسم صف بين صفحتين
      const top0 = sheet.getBoundingClientRect().top;
      const cuts = [...sheet.querySelectorAll('tr, .ps-sub, .ps-note, .ps-foot')].map(el => el.getBoundingClientRect().top - top0);
      const W = sheet.offsetWidth, H = sheet.offsetHeight;
      const pageH = Math.floor(W * 297 / 210);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
      const pw = pdf.internal.pageSize.getWidth(), k = pw / W;
      let y = 0, first = true;
      while (y < H - 1) {
        let end = Math.min(y + pageH, H);
        if (end < H) {
          const c = cuts.filter(v => v > y + 40 && v <= end).pop();
          if (c) end = c;
        }
        const part = document.createElement('canvas');
        part.width = canvas.width; part.height = Math.ceil((end - y) * SCALE);
        const g = part.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, part.width, part.height);
        g.drawImage(canvas, 0, Math.floor(y * SCALE), canvas.width, part.height, 0, 0, canvas.width, part.height);
        if (!first) pdf.addPage();
        pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, (end - y) * k);
        first = false; y = end;
      }
      await saveFile(`${SHEETS[kind].file}-${iso}.pdf`, pdf.output('blob'), `${SHEETS[kind].plain}-${iso}.pdf`);
    } catch (e) {
      console.error(e); toast('تعذّر تجهيز الـ PDF');
    } finally {
      sheet.classList.remove('render');
      pdfBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }

  // ---------------- الإحصائيات ----------------
  function renderStats() {
    const { cnt, abs, last, swA, swB } = historyCounts(null);
    const total = Object.values(cnt).reduce((a, b) => a + b, 0);
    const days = Object.keys(db.history).length;
    const covered = Object.keys(cnt).length;
    const topId = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    const swaps = Object.values(swB).reduce((a, b) => a + b, 0);
    const missing = Object.values(db.history).reduce((n, h) => n + (h.rows || []).filter(r => !r.sub).length, 0);
    $('#kpis').innerHTML = `
      <div class="kpi"><span>إجمالي حصص التأمين</span><b>${arNum(total)}</b><small>خلال ${arNum(days)} يوم مسجّل</small></div>
      <div class="kpi"><span>معلمون أمّنوا</span><b>${arNum(covered)}</b><small>المتوسط ${covered ? arNum(+(total / covered).toFixed(1)) : '٠'} حصة لكل معلم</small></div>
      <div class="kpi"><span>حصص تبدّلت</span><b>${arNum(swaps)}</b><small>بين المعلمين بدل التأمين</small></div>
      <div class="kpi"><span>الأكثر تأمينًا</span><b class="kpi-name">${topId ? esc(nm(topId)) : '—'}</b><small>${topId ? arNum(cnt[topId]) + ' حصة' : ''}${missing ? ` · ${arNum(missing)} حصة بلا مؤمِّن` : ''}</small></div>`;
    const sort = $('#statsSort').value;
    const list = T.filter(t => !availOf(t).released || cnt[t.id]);
    list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ar')
      : sort === 'dept' ? deptOrder.indexOf(a.dept) - deptOrder.indexOf(b.dept) || (cnt[b.id] || 0) - (cnt[a.id] || 0)
      : (cnt[b.id] || 0) - (cnt[a.id] || 0) || a.name.localeCompare(b.name, 'ar'));
    const max = Math.max(1, ...Object.values(cnt));
    $('#statsTable').innerHTML = `<thead><tr><th>المعلم</th><th>القسم</th><th>مرات التأمين</th><th>النسبة</th><th></th><th>النصاب الأسبوعي</th><th>العبء</th><th>الغياب</th><th>تبديل لزميل</th><th>طلب تبديل</th><th>آخر تأمين</th></tr></thead><tbody>${list.map(t => {
      const n = cnt[t.id] || 0, pct = total ? n / total * 100 : 0;
      return `<tr><td><b>${esc(t.name)}</b></td><td class="muted">${esc(t.dept)}</td><td class="num">${arNum(n)}</td><td class="num">${arNum(pct.toFixed(1))}٪</td>
        <td><div class="bar"><i style="width:${n / max * 100}%"></i></div></td><td class="num">${arNum(t.teaching)}</td>
        <td class="num">${t.teaching ? arNum((n / t.teaching * 100).toFixed(0)) + '٪' : '—'}</td><td class="num">${arNum(abs[t.id] || 0)}</td>
        <td class="num">${arNum(swB[t.id] || 0)}</td><td class="num">${arNum(swA[t.id] || 0)}</td><td class="muted">${last[t.id] ? gHTML(last[t.id]) : '—'}</td></tr>`;
    }).join('')}</tbody>`;
    const hs = Object.keys(db.history).sort().reverse();
    $('#historyList').innerHTML = hs.length ? hs.map(iso => {
      const h = db.history[iso];
      const names = Object.keys(h.absent || {}).map(nm).join('، ');
      const sw = (h.swaps || []).map(s => nm(s.a)).join('، ');
      return `<div class="hist-item"><div><b>${esc(weekdayName(iso))} ${gHTML(iso)}</b><small>الغائبون: ${esc(names) || '—'} · ${arNum((h.rows || []).length)} حصة${sw ? ` · تبديل: ${esc(sw)}` : ''}</small></div>
        <div class="btn-row"><button class="btn" data-open="${iso}">فتح</button><button class="btn" data-hpdf="${iso}">PDF التأمين</button>${(h.swaps || []).length ? `<button class="btn" data-hspdf="${iso}">PDF التبديل</button>` : ''}<button class="btn danger" data-del="${iso}">حذف</button></div></div>`;
    }).join('') : '<p class="muted">ما فيه أيام مسجّلة للحين. أول ما تختار غائبين أو تضيف تبديل، اليوم يتسجّل تلقائيًا.</p>';
  }

  // ---------------- المعلمون ----------------
  const openTT = new Set();
  function renderTeachers() {
    const q = $('#tSearch').value.trim();
    $('#teacherList').innerHTML = T.filter(t => !q || t.name.includes(q) || t.dept.includes(q)).map(t => {
      const a = availOf(t);
      const days = DAYS.map((n, d) => `<button class="daytog ${a.days.includes(d) ? 'on' : ''}" data-tday="${t.id}" data-d="${d}" ${a.released ? 'disabled' : ''}>${n}</button>`).join('');
      return `<div class="t-row"><div class="t-top"><div class="t-name"><b>${esc(t.name)}</b><small>${esc(t.dept)} · ${arNum(t.teaching)} حصة تدريس · المجموع ${arNum(t.total)}</small></div>
        <div class="t-ctrl">${days}<button class="relbtn ${a.released ? 'on' : ''}" data-rel="${t.id}">${a.released ? 'مفرّغ كليًا' : 'تفريغ كلي'}</button><button class="link" data-tt="${t.id}">${openTT.has(t.id) ? 'إخفاء الجدول' : 'الجدول'}</button></div></div>
        ${openTT.has(t.id) ? ttHTML(t) : ''}</div>`;
    }).join('');
  }
  function ttHTML(t) {
    const head = SLOT_ORDER.map(s => `<th>${SLOT_NAME[s]}</th>`).join('');
    const body = DAYS.map((n, d) => `<tr><th>${n}</th>${SLOT_ORDER.map(s => {
      const c = t.cells[`${d}-${s}`];
      if (!c) return `<td class="${s === 'B' ? 'brk' : ''}"></td>`;
      return `<td class="${s === 'B' ? 'brk' : ''} ${NON_TEACHING.has(c.t) ? 'meet' : ''}">${c.c ? codeHTML(c.c) : ''}<small>${esc(c.t)}</small></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="tt table-wrap"><table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ---------------- الإعدادات ----------------
  function renderSettings() {
    const s = db.settings;
    $('#setPrincipal').value = s.principal; $('#setAssistant').value = s.assistant;
    $('#setMax').value = String(s.maxPerDay); $('#setDept').checked = s.deptFirst;
    $('#setBreak').checked = s.coverBreak; $('#setConsec').checked = s.avoidConsec;
    $('#sourceNote').textContent = `مصدر الجدول: ${window.TIMETABLE.source} — ${T.length} معلمًا`;
  }

  // ---------------- الأحداث ----------------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    $('#dateArea').hidden = !(name === 'today' || name === 'swaps');
    if (name === 'stats') renderStats();
    if (name === 'teachers') renderTeachers();
    if (name === 'settings') renderSettings();
    if (name === 'today' || name === 'swaps') renderAll();
    try { localStorage.setItem(STORE + '-tab', name); } catch (e) { }
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  $('#dateInput').addEventListener('change', e => { if (e.target.value) { swDraft = { a: '', from: '', pick: [] }; loadDate(e.target.value); } });
  $('#absSearch').addEventListener('input', renderAbsList);

  const afterChange = () => { recompute(); renderAll(); };
  $('#absList').addEventListener('click', e => {
    const b = e.target.closest('[data-abs]'); if (!b) return;
    const id = b.dataset.abs;
    if (state.absent[id]) delete state.absent[id];
    else {
      const ctx = context();
      state.absent[id] = dayCells(ctx, id).filter(x => coverable(x.cell)).map(x => x.s);
      state.swaps = state.swaps.filter(sw => sw.a !== id); // الغياب يلغي طلب التبديل
    }
    afterChange();
  });
  $('#absSlots').addEventListener('click', e => {
    const p = e.target.closest('[data-pill]'), all = e.target.closest('[data-all]'), rm = e.target.closest('[data-rm]');
    if (p) {
      const arr = state.absent[p.dataset.pill], s = p.dataset.s;
      state.absent[p.dataset.pill] = arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s];
    } else if (all) state.absent[all.dataset.all] = dayCells(context(), all.dataset.all).filter(x => coverable(x.cell)).map(x => x.s);
    else if (rm) delete state.absent[rm.dataset.rm];
    else return;
    afterChange();
  });

  $('#btnRedistribute').addEventListener('click', () => { recompute(true); renderAll(); toast('تمت إعادة التوزيع'); });
  $('#resTable').addEventListener('change', e => {
    const sel = e.target.closest('select[data-row]'); if (!sel) return;
    const r = state.rows[+sel.dataset.row];
    r.sub = sel.value; r.m = true;
    commit(); renderResults();
  });
  if (!claudeHost) { $('#btnPrint').hidden = false; $('#btnSwapPrint').hidden = false; }
  $('#btnPrint').addEventListener('click', () => printDay(date, state));
  $('#btnPdf').addEventListener('click', e => pdfDay(date, state, e.currentTarget));

  // التبديل
  $('#swTeacher').addEventListener('change', e => { swDraft = { a: e.target.value, from: '', pick: [] }; renderSwapForm(); });
  $('#swFrom').addEventListener('change', e => { swDraft.from = e.target.value; renderSwapForm(); });
  document.querySelectorAll('input[name=swMode]').forEach(r => r.addEventListener('change', renderSwapForm));
  $('#swPills').addEventListener('click', e => {
    const p = e.target.closest('[data-swp]'); if (!p) return;
    const s = p.dataset.swp;
    swDraft.pick = swDraft.pick.includes(s) ? swDraft.pick.filter(x => x !== s) : [...swDraft.pick, s];
    renderSwapForm();
  });
  $('#btnSwap').addEventListener('click', () => {
    const slots = swSlots(); if (!swDraft.a || !slots.length) return;
    const ctx = context();
    const mode = document.querySelector('input[name=swMode]:checked').value;
    const items = slots.map(s => { const c = ctx.cell(swDraft.a, s); return { s, c: c.c, t: c.t, b: '', s2: '', t2: '' }; });
    state.swaps.push({ a: swDraft.a, mode, from: swDraft.from, slots: swWindow(), reason: $('#swReason').value.trim(), items });
    swDraft = { a: '', from: '', pick: [] }; $('#swReason').value = '';
    afterChange();
    const sw = state.swaps[state.swaps.length - 1];
    const ok = sw.items.filter(it => it.b).length;
    toast(ok === sw.items.length ? `تم ترتيب ${arNum(ok)} تبديل` : `تبدّل ${arNum(ok)} من ${arNum(sw.items.length)} — الباقي دخل جدول التأمين`);
  });
  $('#swapList').addEventListener('change', e => {
    const sel = e.target.closest('select[data-sw]'); if (!sel) return;
    const it = state.swaps[+sel.dataset.sw].items[+sel.dataset.it];
    if (sel.value) { const [b, s2] = sel.value.split('|'); Object.assign(it, { b, s2, m: true, none: false }); }
    else Object.assign(it, { b: '', s2: '', t2: '', m: true, none: true });
    afterChange();
  });
  $('#btnSwapPdf').addEventListener('click', e => pdfDay(date, state, e.currentTarget, 'swap'));
  $('#btnSwapPrint').addEventListener('click', () => printDay(date, state, 'swap'));
  $('#swapList').addEventListener('click', async e => {
    const d = e.target.closest('[data-swdel]'); if (!d) return;
    const sw = state.swaps[+d.dataset.swdel];
    if (!(await ask(`إلغاء طلب ${nm(sw.a)}؟`, 'إلغاء الطلب'))) return;
    state.swaps.splice(+d.dataset.swdel, 1);
    afterChange();
  });

  $('#statsSort').addEventListener('change', renderStats);
  $('#historyList').addEventListener('click', async e => {
    const o = e.target.closest('[data-open]'), p = e.target.closest('[data-hpdf]'), ps = e.target.closest('[data-hspdf]'), d = e.target.closest('[data-del]');
    if (o) { loadDate(o.dataset.open); showTab('today'); }
    if (p) pdfDay(p.dataset.hpdf, db.history[p.dataset.hpdf], p);
    if (ps) pdfDay(ps.dataset.hspdf, db.history[ps.dataset.hspdf], ps, 'swap');
    if (d && await ask(`حذف يوم ${fmtG(d.dataset.del)} من السجل؟`, 'حذف')) {
      delete db.history[d.dataset.del]; persist();
      if (d.dataset.del === date) state = emptyDay();
      renderStats();
    }
  });

  $('#tSearch').addEventListener('input', renderTeachers);
  $('#teacherList').addEventListener('click', e => {
    const dt = e.target.closest('[data-tday]'), rel = e.target.closest('[data-rel]'), tt = e.target.closest('[data-tt]');
    if (dt) {
      const t = byId[dt.dataset.tday], a = { ...availOf(t) }, d = +dt.dataset.d;
      a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d].sort();
      db.avail[t.id] = a; persist();
    } else if (rel) {
      const t = byId[rel.dataset.rel], a = { ...availOf(t) };
      a.released = !a.released; db.avail[t.id] = a; persist();
    } else if (tt) { openTT.has(tt.dataset.tt) ? openTT.delete(tt.dataset.tt) : openTT.add(tt.dataset.tt); }
    else return;
    renderTeachers();
  });

  const bindSetting = (sel, key, fn) => $(sel).addEventListener('change', e => { db.settings[key] = fn(e.target); persist(); });
  bindSetting('#setPrincipal', 'principal', el => el.value.trim());
  bindSetting('#setAssistant', 'assistant', el => el.value.trim());
  bindSetting('#setMax', 'maxPerDay', el => +el.value);
  bindSetting('#setDept', 'deptFirst', el => el.checked);
  bindSetting('#setBreak', 'coverBreak', el => el.checked);
  bindSetting('#setConsec', 'avoidConsec', el => el.checked);

  $('#btnExport').addEventListener('click', () => saveFile(`تأمين-نسخة-${isoOf(new Date())}.json`, new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }), `taameen-backup-${isoOf(new Date())}.json`));
  $('#fileImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = '';
    try {
      const data = JSON.parse(await f.text());
      if (!data.history || !data.settings) throw new Error('bad');
      if (!(await ask('استرجاع النسخة سيستبدل البيانات الحالية. متأكد؟', 'استرجاع'))) return;
      db = { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
      if (data.drafts) { Object.assign(db.history, data.drafts); delete db.drafts; }
      persist(); renderSettings(); loadDate(date); toast('تم الاسترجاع');
    } catch (err) { toast('الملف غير صالح'); }
  });
  $('#btnReset').addEventListener('click', async () => {
    if (!(await ask('مسح كل سجل التأمين والإحصائيات؟ (الإعدادات تبقى)', 'مسح'))) return;
    db.history = {}; persist(); loadDate(date); toast('تم مسح السجل');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) $('#modalNo').click(); });

  // ---------------- البداية ----------------
  renderHeroDate();
  renderSettings();
  const start = new Date();
  while (start.getDay() > 4) start.setDate(start.getDate() + 1);
  loadDate(isoOf(start));
  try {
    const tab = localStorage.getItem(STORE + '-tab');
    if (tab && document.querySelector(`.tab[data-tab="${tab}"]`)) showTab(tab);
  } catch (e) { }
})();
