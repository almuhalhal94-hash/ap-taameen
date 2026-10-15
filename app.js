(() => {
  'use strict';

  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const SLOT_ORDER = ['1', '2', '3', 'B', '4', '5', '6', '7'];
  const SLOT_NAME = { '1': 'الأولى', '2': 'الثانية', '3': 'الثالثة', 'B': 'الفسحة', '4': 'الرابعة', '5': 'الخامسة', '6': 'السادسة', '7': 'السابعة' };
  const NON_TEACHING = new Set(['مراقبة', 'اجتماع القسم', 'اجتماع التحسين', 'مشرف متابع']);
  const STORE = 'ap-taameen-v1';

  const T = window.TIMETABLE.teachers;
  const byId = Object.fromEntries(T.map(t => [t.id, t]));
  const deptOrder = [...new Set(T.map(t => t.dept))];

  // ---------------- التخزين ----------------
  const defaults = () => ({
    settings: { principal: '', assistant: '', maxPerDay: 1, deptFirst: true, coverBreak: true, avoidConsec: true },
    avail: {},      // tid -> {released:bool, days:[0..4]}
    history: {},    // 'YYYY-MM-DD' -> {absent:{tid:[slots]}, rows:[...], savedAt}
    drafts: {}      // 'YYYY-MM-DD' -> {absent:{tid:[slots]}, rows:[...]}
  });
  let db = defaults();
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      db = { ...db, ...parsed, settings: { ...db.settings, ...(parsed.settings || {}) } };
    }
  } catch (e) { /* يبدأ فاضي */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { toast('تعذّر الحفظ في المتصفح'); } };

  // افتراضيًا: مفرّغ كليًا إذا ما عنده أي حصة تدريس في الأسبوع
  T.forEach(t => {
    t.teaching = Object.values(t.cells).filter(c => !NON_TEACHING.has(c.t)).length;
  });
  const availOf = t => db.avail[t.id] || { released: t.teaching === 0, days: t.days.slice() };
  const presentOn = (t, d) => { const a = availOf(t); return !a.released && a.days.includes(d); };

  // ---------------- أدوات ----------------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const code = c => c ? `<span class="code">${esc(c)}</span>` : '<span class="muted">—</span>';
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
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------------- الحالة الحالية ----------------
  let date = isoOf(new Date());
  let state = { absent: {}, rows: [] }; // rows: {d,slot,c,t,absent,sub,auto}

  function loadDate(iso) {
    date = iso;
    const src = db.drafts[iso] || db.history[iso];
    state = src ? JSON.parse(JSON.stringify({ absent: src.absent, rows: src.rows })) : { absent: {}, rows: [] };
    renderToday();
  }
  function saveDraft() { db.drafts[date] = JSON.parse(JSON.stringify(state)); persist(); }

  // ---------------- العدّ ----------------
  function historyCounts(excludeDate) {
    const cnt = {}, abs = {}, last = {};
    for (const [iso, h] of Object.entries(db.history)) {
      if (iso === excludeDate) continue;
      for (const r of h.rows) if (r.sub) { cnt[r.sub] = (cnt[r.sub] || 0) + 1; if (!last[r.sub] || iso > last[r.sub]) last[r.sub] = iso; }
      for (const tid of Object.keys(h.absent)) abs[tid] = (abs[tid] || 0) + 1;
    }
    return { cnt, abs, last };
  }
  const dayCells = (t, d) => SLOT_ORDER.map(s => ({ s, cell: t.cells[`${d}-${s}`] })).filter(x => x.cell);
  const busy = (t, d, s) => !!t.cells[`${d}-${s}`];

  // الحصص اللي تحتاج تأمين للغائب
  function needsFor(tid, d) {
    const t = byId[tid];
    return dayCells(t, d).filter(({ cell }) => !NON_TEACHING.has(cell.t) || (cell.t === 'مراقبة' && db.settings.coverBreak));
  }

  // أطول سلسلة حصص متتالية بعد إضافة حصة (الفسحة تفصل)
  function runAfter(t, d, s, extra) {
    const teach = new Set(SLOT_ORDER.filter(x => x !== 'B' && busy(t, d, x)));
    extra.forEach(x => teach.add(x));
    teach.add(s);
    let best = 0, run = 0;
    for (const x of SLOT_ORDER) {
      if (x === 'B') { run = 0; continue; }
      run = teach.has(x) ? run + 1 : 0; best = Math.max(best, run);
    }
    return best;
  }

  // المرشحون لحصة معيّنة مرتبين من الأنسب
  function candidates(row, rows, hist) {
    const d = row.d, s = row.slot;
    const absentSet = new Set(Object.keys(state.absent));
    const absT = byId[row.absent];
    const takenAtSlot = new Set(rows.filter(r => r !== row && r.slot === s && r.sub).map(r => r.sub));
    const todayCount = {}, todayExtra = {};
    rows.forEach(r => { if (r !== row && r.sub) { todayCount[r.sub] = (todayCount[r.sub] || 0) + 1; (todayExtra[r.sub] = todayExtra[r.sub] || []).push(r.slot); } });
    const list = T.filter(t => presentOn(t, d) && !absentSet.has(t.id) && !busy(t, d, s) && !takenAtSlot.has(t.id));
    const minHist = list.length ? Math.min(...list.map(t => hist.cnt[t.id] || 0)) : 0;
    return list.map(t => {
      const h = hist.cnt[t.id] || 0;
      const tc = todayCount[t.id] || 0;
      const same = t.dept === absT.dept;
      const load = dayCells(t, d).filter(x => !NON_TEACHING.has(x.cell.t)).length;
      const run = s === 'B' ? 0 : runAfter(t, d, s, (todayExtra[t.id] || []).filter(x => x !== 'B'));
      const over = tc >= db.settings.maxPerDay;
      const deptTier = db.settings.deptFirst && same && h - minHist <= 2 ? 0 : 1;
      const consec = db.settings.avoidConsec && run >= 3 ? 1 : 0;
      return { t, h, tc, same, load, run, over, key: [over ? 1 : 0, tc, consec, deptTier, h, load, t.total] };
    }).sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      return a.t.name.localeCompare(b.t.name, 'ar');
    });
  }

  function distribute() {
    const d = dayIdx(date);
    const rows = [];
    for (const [tid, slots] of Object.entries(state.absent)) {
      for (const { s, cell } of needsFor(tid, d)) {
        if (!slots.includes(s)) continue;
        rows.push({ d, slot: s, c: cell.c, t: cell.t, absent: tid, sub: '' });
      }
    }
    const hist = historyCounts(date);
    // الأصعب أولًا: الحصة اللي مرشحينها أقل
    const pending = rows.slice();
    while (pending.length) {
      pending.forEach(r => { r._n = candidates(r, rows, hist).filter(c => !c.over).length; });
      pending.sort((a, b) => a._n - b._n || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
      const r = pending.shift();
      const best = candidates(r, rows, hist).find(c => !c.over);
      r.sub = best ? best.t.id : '';
    }
    rows.forEach(r => delete r._n);
    rows.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || byId[a.absent].name.localeCompare(byId[b.absent].name, 'ar'));
    state.rows = rows;
    saveDraft();
    renderResults();
    const miss = rows.filter(r => !r.sub).length;
    toast(miss ? `تم التوزيع — ${arNum(miss)} حصة بدون مؤمِّن، اخترها يدويًا` : `تم توزيع ${arNum(rows.length)} حصة`);
  }

  // ---------------- الواجهة: اليوم ----------------
  function renderHeroDate() {
    const now = isoOf(new Date());
    $('#heroDate').innerHTML = `<small>اليوم</small><b>${esc(weekdayName(now))}</b><small>${gHTML((now))} · ${esc(fmtH(now))}</small>`;
  }

  function renderToday() {
    $('#dateInput').value = date;
    const d = dayIdx(date);
    $('#dayInfo').innerHTML = `${esc(weekdayName(date))}<small>${gHTML((date))} — ${esc(fmtH(date))}</small>`;
    $('#savedFlag').hidden = !db.history[date];
    $('#weekendMsg').hidden = d !== -1;
    $('#dayWork').hidden = d === -1;
    if (d === -1) return;
    renderAbsList();
    renderAbsDetail();
    renderResults();
  }

  function renderAbsList() {
    const d = dayIdx(date);
    const q = $('#absSearch').value.trim();
    const html = deptOrder.map(dep => {
      const ts = T.filter(t => t.dept === dep && (!q || t.name.includes(q)));
      if (!ts.length) return '';
      return `<div class="dept"><h3>${esc(dep)}</h3><div class="chips">${ts.map(t => {
        const a = availOf(t);
        const on = !!state.absent[t.id];
        if (!presentOn(t, d)) {
          const why = a.released ? 'مفرّغ' : 'غير متواجد اليوم';
          return `<span class="chip off" title="${why}">${esc(t.name)} <span class="tag">${why}</span></span>`;
        }
        const n = needsFor(t.id, d).length;
        return `<button class="chip ${on ? 'on' : ''}" data-abs="${t.id}" aria-pressed="${on}">${esc(t.name)} <span class="tag">${arNum(n)} حصة</span></button>`;
      }).join('')}</div></div>`;
    }).join('');
    $('#absList').innerHTML = html || '<p class="muted">لا يوجد نتائج</p>';
  }

  function renderAbsDetail() {
    const d = dayIdx(date);
    const ids = Object.keys(state.absent);
    $('#absDetail').hidden = !ids.length;
    const total = ids.reduce((n, id) => n + state.absent[id].length, 0);
    $('#needNote').textContent = ids.length ? `${arNum(ids.length)} غائب · ${arNum(total)} حصة تحتاج تأمين` : 'اختر الغائبين أولًا';
    $('#btnDistribute').disabled = !total;
    $('#absSlots').innerHTML = ids.map(id => {
      const t = byId[id];
      const need = new Set(needsFor(id, d).map(x => x.s));
      const pills = dayCells(t, d).map(({ s, cell }) => {
        if (!need.has(s)) return `<span class="pill na" title="لا تحتاج تأمين">${SLOT_NAME[s]}<small>${esc(cell.t)}</small></span>`;
        const on = state.absent[id].includes(s);
        return `<button class="pill ${on ? 'on' : ''}" data-pill="${id}" data-s="${s}" aria-pressed="${on}">${SLOT_NAME[s]}<small>${cell.c ? code(cell.c) + ' ' : ''}${esc(cell.t)}</small></button>`;
      }).join('');
      return `<div class="abs-block"><header><div><b>${esc(t.name)}</b> <small>· ${esc(t.dept)}</small></div><div><button class="link" data-all="${id}">كل الحصص</button><button class="link" data-rm="${id}">إلغاء الغياب</button></div></header><div class="slot-pills">${pills || '<span class="muted">ما عنده حصص اليوم</span>'}</div></div>`;
    }).join('');
  }

  function renderResults() {
    const rows = state.rows;
    $('#resultCard').hidden = !rows.length;
    if (!rows.length) return;
    const hist = historyCounts(date);
    const body = rows.map((r, i) => {
      const cands = candidates(r, rows, hist);
      const opts = cands.map(c => {
        const note = [c.same ? 'نفس القسم' : c.t.dept, `أمّن ${arNum(c.h)}`, `${arNum(c.load)} حصص اليوم`, c.over ? '⚠ تجاوز الحد' : '', c.run >= 3 ? `⚠ ${arNum(c.run)} متتالية` : ''].filter(Boolean).join(' · ');
        return `<option value="${c.t.id}" ${c.t.id === r.sub ? 'selected' : ''}>${esc(c.t.name)} — ${esc(note)}</option>`;
      }).join('');
      const cur = cands.find(c => c.t.id === r.sub);
      const badge = !r.sub ? '<span class="badge none">بدون مؤمِّن</span>' : cur && cur.same ? '<span class="badge dept">من القسم</span>' : '<span class="badge other">من قسم آخر</span>';
      return `<tr class="${r.sub ? '' : 'missing'}">
        <td class="per" data-l="الحصة">${SLOT_NAME[r.slot]}</td>
        <td data-l="الصف">${code(r.c)}</td>
        <td data-l="المادة">${esc(r.t)}</td>
        <td data-l="الغائب">${esc(byId[r.absent].name)}</td>
        <td data-l="المؤمِّن"><select data-row="${i}" aria-label="المعلم المؤمِّن"><option value="">— بدون تأمين —</option>${opts}</select><span class="why">${badge}</span></td>
      </tr>`;
    }).join('');
    $('#resTable').innerHTML = `<thead><tr><th>الحصة</th><th>الصف</th><th>المادة</th><th>المعلم الغائب</th><th>المعلم المؤمِّن</th></tr></thead><tbody>${body}</tbody>`;
    const cnt = {};
    rows.forEach(r => { if (r.sub) cnt[r.sub] = (cnt[r.sub] || 0) + 1; });
    const lt = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<span class="lt">${esc(byId[id].name)} <b>${arNum(n)}</b></span>`).join('');
    $('#loadToday').innerHTML = lt ? `<span class="muted" style="width:100%;font-size:.85rem">عبء اليوم:</span>${lt}` : '';
  }

  // ---------------- الطباعة ----------------
  function buildPrint(iso, data) {
    const rows = data.rows.slice().sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    const s = db.settings;
    const tr = rows.map((r, i) => `<tr>
      <td>${arNum(i + 1)}</td><td>${SLOT_NAME[r.slot]}</td><td>${r.c ? `<span class="code">${esc(r.c)}</span>` : '—'}</td><td>${esc(r.t)}</td>
      <td class="nm">${esc(byId[r.absent].name)}</td><td class="nm">${r.sub ? esc(byId[r.sub].name) : '................................'}</td><td class="sig"></td></tr>`).join('');
    $('#printSheet').innerHTML = `
      <div class="ps-head"><img src="assets/header.jpg" alt=""></div>
      <h1 class="ps-title">كشف تأمين الحصص</h1>
      <div class="ps-meta"><span>اليوم: <b>${esc(weekdayName(iso))}</b></span><span>التاريخ: <b>${gHTML((iso))}</b></span><span>الموافق: <b>${esc(fmtH(iso))}</b></span></div>
      <table class="ps-table">
        <thead><tr><th style="width:5%">م</th><th style="width:9%">الحصة</th><th style="width:8%">الصف</th><th style="width:11%">المادة</th><th>المعلم الغائب</th><th>المعلم المؤمِّن</th><th>التوقيع بالعلم</th></tr></thead>
        <tbody>${tr}</tbody>
      </table>
      <p class="ps-note">نأمل من المعلمين الأفاضل التوقيع بالعلم، والتواجد في الصف بداية الحصة. شاكرين تعاونكم.</p>
      <div class="ps-foot">
        <div><div class="role">المدير المساعد</div><div class="pname">${esc(s.assistant)}</div><div class="sigline">التوقيع</div></div>
        <div><div class="role">مدير المدرسة</div><div class="pname">${esc(s.principal)}</div><div class="sigline">التوقيع</div></div>
      </div>`;
  }
  function printDay(iso, data) {
    if (!data.rows.length) { toast('ما فيه حصص للطباعة'); return; }
    buildPrint(iso, data);
    const old = document.title;
    document.title = `كشف تأمين ${weekdayName(iso)} ${fmtG(iso)}`;
    const img = $('#printSheet img');
    const go = () => { window.print(); document.title = old; };
    if (img.complete) go(); else img.onload = img.onerror = go;
  }

  // ---------------- الإحصائيات ----------------
  function renderStats() {
    const { cnt, abs, last } = historyCounts(null);
    const total = Object.values(cnt).reduce((a, b) => a + b, 0);
    const days = Object.keys(db.history).length;
    const covered = Object.keys(cnt).length;
    const topId = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    const missing = Object.values(db.history).reduce((n, h) => n + h.rows.filter(r => !r.sub).length, 0);
    $('#kpis').innerHTML = `
      <div class="kpi"><span>إجمالي حصص التأمين</span><b>${arNum(total)}</b><small>خلال ${arNum(days)} يوم محفوظ</small></div>
      <div class="kpi"><span>معلمون أمّنوا</span><b>${arNum(covered)}</b><small>من ${arNum(T.length)} معلم</small></div>
      <div class="kpi"><span>المتوسط لكل معلم أمّن</span><b>${covered ? arNum(+(total / covered).toFixed(1)) : '٠'}</b><small>حصة</small></div>
      <div class="kpi"><span>الأكثر تأمينًا</span><b style="font-size:1.15rem">${topId ? esc(byId[topId].name) : '—'}</b><small>${topId ? arNum(cnt[topId]) + ' حصة' : ''}${missing ? ` · ${arNum(missing)} حصة بلا مؤمِّن` : ''}</small></div>`;
    const sort = $('#statsSort').value;
    const list = T.filter(t => !availOf(t).released || cnt[t.id]).slice();
    list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ar')
      : sort === 'dept' ? deptOrder.indexOf(a.dept) - deptOrder.indexOf(b.dept) || (cnt[b.id] || 0) - (cnt[a.id] || 0)
      : (cnt[b.id] || 0) - (cnt[a.id] || 0) || a.name.localeCompare(b.name, 'ar'));
    const max = Math.max(1, ...Object.values(cnt));
    $('#statsTable').innerHTML = `<thead><tr><th>المعلم</th><th>القسم</th><th>مرات التأمين</th><th>النسبة</th><th></th><th>النصاب الأسبوعي</th><th>العبء</th><th>مرات الغياب</th><th>آخر تأمين</th></tr></thead><tbody>${list.map(t => {
      const n = cnt[t.id] || 0;
      const pct = total ? (n / total * 100) : 0;
      return `<tr><td><b>${esc(t.name)}</b></td><td class="muted">${esc(t.dept)}</td><td class="num">${arNum(n)}</td><td class="num">${arNum(pct.toFixed(1))}٪</td>
        <td><div class="bar"><i style="width:${n / max * 100}%"></i></div></td><td class="num">${arNum(t.teaching)}</td>
        <td class="num">${t.teaching ? arNum((n / t.teaching * 100).toFixed(0)) + '٪' : '—'}</td><td class="num">${arNum(abs[t.id] || 0)}</td><td class="muted">${last[t.id] ? gHTML((last[t.id])) : '—'}</td></tr>`;
    }).join('')}</tbody>`;
    const hs = Object.keys(db.history).sort().reverse();
    $('#historyList').innerHTML = hs.length ? hs.map(iso => {
      const h = db.history[iso];
      const names = Object.keys(h.absent).map(id => byId[id] ? byId[id].name : id).join('، ');
      return `<div class="hist-item"><div><b>${esc(weekdayName(iso))} ${gHTML((iso))}</b><small>الغائبون: ${esc(names) || '—'} · ${arNum(h.rows.length)} حصة</small></div>
        <div class="btn-row"><button class="btn" data-open="${iso}">فتح</button><button class="btn" data-print="${iso}">طباعة</button><button class="btn danger" data-del="${iso}">حذف</button></div></div>`;
    }).join('') : '<p class="muted">ما فيه أيام محفوظة للحين. بعد ما توزّع التأمين اضغط «اعتماد وحفظ».</p>';
  }

  // ---------------- المعلمون ----------------
  const openTT = new Set();
  function renderTeachers() {
    const q = $('#tSearch').value.trim();
    $('#teacherList').innerHTML = T.filter(t => !q || t.name.includes(q) || t.dept.includes(q)).map(t => {
      const a = availOf(t);
      const days = DAYS.map((nm, d) => `<button class="daytog ${a.days.includes(d) ? 'on' : ''}" data-tday="${t.id}" data-d="${d}" ${a.released ? 'disabled' : ''}>${nm}</button>`).join('');
      return `<div class="t-row"><div class="t-top"><div class="t-name"><b>${esc(t.name)}</b><small>${esc(t.dept)} · ${arNum(t.teaching)} حصة تدريس · المجموع ${arNum(t.total)}</small></div>
        <div class="t-ctrl">${days}<button class="relbtn ${a.released ? 'on' : ''}" data-rel="${t.id}">${a.released ? 'مفرّغ كليًا' : 'تفريغ كلي'}</button><button class="link" data-tt="${t.id}">${openTT.has(t.id) ? 'إخفاء الجدول' : 'الجدول'}</button></div></div>
        ${openTT.has(t.id) ? ttHTML(t) : ''}</div>`;
    }).join('');
  }
  function ttHTML(t) {
    const head = SLOT_ORDER.map(s => `<th>${SLOT_NAME[s]}</th>`).join('');
    const body = DAYS.map((nm, d) => `<tr><th>${nm}</th>${SLOT_ORDER.map(s => {
      const c = t.cells[`${d}-${s}`];
      if (!c) return `<td class="${s === 'B' ? 'brk' : ''}"></td>`;
      return `<td class="${s === 'B' ? 'brk' : ''} ${NON_TEACHING.has(c.t) ? 'meet' : ''}">${c.c ? `<span class="code">${esc(c.c)}</span>` : ''}<small>${esc(c.t)}</small></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="tt table-wrap"><table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function setAvail(t, a) { db.avail[t.id] = a; persist(); }

  // ---------------- الإعدادات ----------------
  function renderSettings() {
    const s = db.settings;
    $('#setPrincipal').value = s.principal; $('#setAssistant').value = s.assistant;
    $('#setMax').value = String(s.maxPerDay); $('#setDept').checked = s.deptFirst;
    $('#setBreak').checked = s.coverBreak; $('#setConsec').checked = s.avoidConsec;
    $('#sourceNote').textContent = `مصدر الجدول: ${window.TIMETABLE.source} — ${T.length} معلمًا`;
  }

  // ---------------- الأحداث ----------------
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'stats') renderStats();
    if (b.dataset.tab === 'teachers') renderTeachers();
    if (b.dataset.tab === 'settings') renderSettings();
    if (b.dataset.tab === 'today') renderToday();
    try { localStorage.setItem(STORE + '-tab', b.dataset.tab); } catch (e) { }
  }));

  $('#dateInput').addEventListener('change', e => { if (e.target.value) loadDate(e.target.value); });
  $('#absSearch').addEventListener('input', renderAbsList);

  $('#absList').addEventListener('click', e => {
    const b = e.target.closest('[data-abs]'); if (!b) return;
    const id = b.dataset.abs;
    if (state.absent[id]) delete state.absent[id];
    else state.absent[id] = needsFor(id, dayIdx(date)).map(x => x.s);
    state.rows = [];
    saveDraft(); renderAbsList(); renderAbsDetail(); renderResults();
  });
  $('#absSlots').addEventListener('click', e => {
    const p = e.target.closest('[data-pill]'), all = e.target.closest('[data-all]'), rm = e.target.closest('[data-rm]');
    if (p) {
      const arr = state.absent[p.dataset.pill], s = p.dataset.s;
      state.absent[p.dataset.pill] = arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s];
    } else if (all) state.absent[all.dataset.all] = needsFor(all.dataset.all, dayIdx(date)).map(x => x.s);
    else if (rm) delete state.absent[rm.dataset.rm];
    else return;
    state.rows = [];
    saveDraft(); renderAbsList(); renderAbsDetail(); renderResults();
  });

  $('#btnDistribute').addEventListener('click', () => { distribute(); $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#btnRedistribute').addEventListener('click', distribute);
  $('#resTable').addEventListener('change', e => {
    const sel = e.target.closest('select[data-row]'); if (!sel) return;
    state.rows[+sel.dataset.row].sub = sel.value;
    saveDraft(); renderResults();
  });
  $('#btnSave').addEventListener('click', () => {
    db.history[date] = { ...JSON.parse(JSON.stringify(state)), savedAt: new Date().toISOString() };
    delete db.drafts[date];
    persist(); $('#savedFlag').hidden = false;
    const miss = state.rows.filter(r => !r.sub).length;
    toast(miss ? `تم الحفظ — تنبيه: ${arNum(miss)} حصة بدون مؤمِّن` : 'تم اعتماد التأمين وحفظه في السجل');
  });
  $('#btnPrint').addEventListener('click', () => printDay(date, state));

  $('#statsSort').addEventListener('change', renderStats);
  $('#historyList').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'), p = e.target.closest('[data-print]'), d = e.target.closest('[data-del]');
    if (o) { delete db.drafts[o.dataset.open]; loadDate(o.dataset.open); document.querySelector('[data-tab="today"]').click(); }
    if (p) printDay(p.dataset.print, db.history[p.dataset.print]);
    if (d && confirm(`حذف تأمين يوم ${fmtG(d.dataset.del)} من السجل؟`)) { delete db.history[d.dataset.del]; persist(); renderStats(); }
  });

  $('#tSearch').addEventListener('input', renderTeachers);
  $('#teacherList').addEventListener('click', e => {
    const dt = e.target.closest('[data-tday]'), rel = e.target.closest('[data-rel]'), tt = e.target.closest('[data-tt]');
    if (dt) {
      const t = byId[dt.dataset.tday], a = { ...availOf(t) }, d = +dt.dataset.d;
      a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d].sort();
      setAvail(t, a);
    } else if (rel) {
      const t = byId[rel.dataset.rel], a = { ...availOf(t) };
      a.released = !a.released; setAvail(t, a);
    } else if (tt) { openTT.has(tt.dataset.tt) ? openTT.delete(tt.dataset.tt) : openTT.add(tt.dataset.tt); }
    else return;
    renderTeachers();
  });

  const bindSetting = (sel, key, fn = el => el.value) => $(sel).addEventListener('change', e => { db.settings[key] = fn(e.target); persist(); });
  bindSetting('#setPrincipal', 'principal', el => el.value.trim());
  bindSetting('#setAssistant', 'assistant', el => el.value.trim());
  bindSetting('#setMax', 'maxPerDay', el => +el.value);
  bindSetting('#setDept', 'deptFirst', el => el.checked);
  bindSetting('#setBreak', 'coverBreak', el => el.checked);
  bindSetting('#setConsec', 'avoidConsec', el => el.checked);

  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `تأمين-نسخة-${isoOf(new Date())}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#fileImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.history || !data.settings) throw new Error();
      if (!confirm('استرجاع النسخة سيستبدل البيانات الحالية. متأكد؟')) return;
      db = { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
      persist(); renderSettings(); loadDate(date); toast('تم الاسترجاع');
    } catch (err) { toast('الملف غير صالح'); }
    e.target.value = '';
  });
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('مسح كل سجل التأمين والإحصائيات؟ (الإعدادات تبقى)')) return;
    db.history = {}; db.drafts = {}; persist(); loadDate(date); toast('تم مسح السجل');
  });

  // ---------------- البداية ----------------
  renderHeroDate();
  renderSettings();
  // إذا اليوم عطلة نبدأ بأقرب يوم دوام
  let start = new Date();
  while (start.getDay() > 4) start.setDate(start.getDate() + 1);
  loadDate(isoOf(start));
  try {
    const tab = localStorage.getItem(STORE + '-tab');
    if (tab && tab !== 'today') document.querySelector(`[data-tab="${tab}"]`)?.click();
  } catch (e) { }
})();
