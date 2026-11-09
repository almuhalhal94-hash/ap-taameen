(() => {
  'use strict';

  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  // فسحتين: الأولى للسادس وأول إعدادي، والثانية لثاني وثالث إعدادي
  const SLOT_ORDER = ['1', '2', 'B1', '3', 'B2', '4', '5', '6', '7'];
  const BREAKS = new Set(['B', 'B1', 'B2']);
  const TEACH_SLOTS = SLOT_ORDER.filter(s => !BREAKS.has(s));
  const SLOT_NAME = { '1': 'الأولى', '2': 'الثانية', '3': 'الثالثة', 'B': 'الفسحة', 'B1': 'الفسحة الأولى', 'B2': 'الفسحة الثانية', '4': 'الرابعة', '5': 'الخامسة', '6': 'السادسة', '7': 'السابعة' };
  // التوقيت بالدقائق: الحصة الثالثة تختلف حسب المرحلة
  // ثاني وثالث إعدادي: 8:55–9:40 ثم الفسحة الثانية 9:40–10:10
  // السادس وأول إعدادي: الفسحة الأولى 8:55–9:25 ثم الحصة 9:25–10:10
  const TIMES = { '1': [445, 490], '2': [490, 535], 'B1': [535, 565], 'B2': [580, 610], 'B': [535, 610], '4': [610, 655], '5': [655, 700], '6': [700, 745], '7': [745, 790] };
  const EARLY3 = new Set(['ع2', 'ع3']);
  const ivOf = (s, code) => {
    if (s !== '3') return TIMES[s] || [0, 0];
    const gs = (code || '').split(' / ').filter(Boolean).map(c => c.slice(1));
    if (!gs.length) return [535, 610];
    const early = gs.some(g => EARLY3.has(g)), late = gs.some(g => !EARLY3.has(g));
    return early && late ? [535, 610] : early ? [535, 580] : [565, 610];
  };
  const startOf = (s, latest) => s === '3' ? (latest ? 565 : 535) : (TIMES[s] || [0])[0];
  const overlap = (a, b) => a[0] < b[1] && b[0] < a[1];
  const hm = m => `${Math.floor(m / 60) > 12 ? Math.floor(m / 60) - 12 : Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  // اسم الحصة مع وقتها لما يكون مختلف (الثالثة والفسحتين)
  const slotLabel = (s, code) => {
    if (s !== '3' && s !== 'B1' && s !== 'B2') return SLOT_NAME[s] || s;
    const iv = ivOf(s, code);
    return `${SLOT_NAME[s]} <small class="tm"><bdi dir="ltr">${hm(iv[0])}–${hm(iv[1])}</bdi></small>`;
  };
  const slotPlain = (s, code) => { const iv = ivOf(s, code); return { name: SLOT_NAME[s] || s, time: `${hm(iv[0])}–${hm(iv[1])}` }; };
  const NON_TEACHING = new Set(['مراقبة', 'اجتماع', 'اجتماع القسم', 'اجتماع التحسين', 'تطوير مهني', 'مشرف متابع']);
  const STORE = 'ap-taameen-v1';
  const slotIdx = s => SLOT_ORDER.indexOf(s);

  const T = window.TIMETABLE.teachers;
  const byId = Object.fromEntries(T.map(t => [t.id, t]));
  const deptOrder = [...new Set(T.map(t => t.dept))];
  // مراقبات الفسحتين من جدولها الجديد بدل مراقبة الفسحة القديمة
  (() => {
    const norm = s => s.replace(/^أ\.\s*/, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, '');
    const byNorm = Object.fromEntries(T.map(t => [norm(t.name), t]));
    T.forEach(t => Object.keys(t.cells).forEach(k => { if (k.endsWith('-B')) delete t.cells[k]; }));
    const DU = window.DUTIES;
    if (!DU) return;
    DU.days.forEach((pair, d) => pair.forEach((names, bi) => names.forEach((n, pi) => {
      const t = byNorm[norm(n)];
      if (!t) { console.warn('اسم غير موجود في جدول المراقبات:', n); return; }
      t.cells[`${d}-B${bi + 1}`] = { c: '', t: 'مراقبة', post: DU.posts[pi] };
      if (!t.days.includes(d)) t.days.push(d);
    })));
  })();
  T.forEach(t => { t.teaching = Object.values(t.cells).filter(c => !NON_TEACHING.has(c.t)).length; });
  // معلمو مراقبة الفسحة (لهم مراقبة في جدول الفسحتين)
  // مستثنون من التأمين ومراقبة الفسحة بقرار الإدارة (أ. محمود عطا تمام — ظرف خاص)
  const NO_COVER = new Set(['t23']);
  const DUTY_T = new Set(T.filter(t => Object.values(t.cells).some(c => c.t === 'مراقبة')).map(t => t.id));

  // ---------------- التخزين ----------------
  const defaults = () => ({
    settings: { principal: '', assistant: '', coverMode: 'auto', swapMode: 'auto', maxPerDay: 1, deptFirst: true, coverBreak: true, avoidConsec: true, supervise: { t30: ['1ع3', '2ع3', '3ع3', '4ع3'], t14: ['3ع2', '4ع2'], t25: ['1ع2', '2ع2'], t29: ['1ب6', '2ب6', '3ب6', '4ب6'], t31: ['1ب6', '2ب6', '3ب6', '4ب6'], t26: ['1ع1', '2ع1', '3ع1', '4ع1'] }, emergency: 'المدير المساعد\nالأخصائي الاجتماعي\nأخصائي تكنولوجيا التعليم\nأمين مصادر التعلم', manualOnly: ['t38', 't39', 't40'], coords: ['t1', 't5', 't10', 't14', 't25', 't29'] },
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
      // نسخة التسليم: يمسح سجل التجارب مرة وحدة ويبقي الإعدادات
      if (!p.clean1) { db.history = {}; db.needSave = true; }
      // مسح التجارب الثاني (8 نوفمبر): السجل وأيام الإرسال
      if (!p.clean2) { db.history = {}; db.settings.sentDays = {}; db.needSave = true; }
      if (!p.clean3) { db.history = {}; db.settings.sentDays = {}; db.needSave = true; }
      // قائمة المنسقين والرياضة المعتمدة (9 نوفمبر) مرة وحدة
      if (!p.roles2) { db.settings.coords = defaults().settings.coords; db.settings.manualOnly = defaults().settings.manualOnly; db.needSave = true; }
    }
    db.clean1 = true; db.clean2 = true; db.clean3 = true; db.roles1 = true; db.roles2 = true;
  } catch (e) { /* يبدأ فاضي */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { toast('تعذّر الحفظ في المتصفح'); } };
  if (db.needSave) { delete db.needSave; persist(); }

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
  const isE = id => typeof id === 'string' && id.startsWith('E:');
  const nm = id => isE(id) ? id.slice(2) : byId[id] ? byId[id].name : id;
  // المشرفون: يأمّنون صفوف مراحلهم فقط
  const ALL_CODES = [...new Set(T.flatMap(t => Object.values(t.cells).flatMap(c => c.c ? c.c.split(' / ') : [])))].sort();
  const GRADES = [...new Set(ALL_CODES.map(c => c.slice(1)))].sort((a, b) => (a[0] === 'ب' ? -1 : 1) - (b[0] === 'ب' ? -1 : 1) || a.localeCompare(b));
  const GRADE_NAME = g => ({ 'ب6': 'السادس', 'ع1': 'أول إعدادي', 'ع2': 'ثاني إعدادي', 'ع3': 'ثالث إعدادي' }[g] || g);
  const supOf = id => (db.settings.supervise || {})[id] || [];
  const supLabel = id => {
    const list = supOf(id); if (!list.length) return '';
    return GRADES.map(g => {
      const all = ALL_CODES.filter(c => c.slice(1) === g), mine = list.filter(c => c.slice(1) === g);
      if (!mine.length) return '';
      return mine.length === all.length ? GRADE_NAME(g) : `${GRADE_NAME(g).replace(' إعدادي', '')} ${mine.map(c => arNum(c[0])).join(' و')}`;
    }).filter(Boolean).join('، ');
  };
  const BREAK_GRADES = { B1: ['ب6', 'ع1'], B2: ['ع2', 'ع3'] };
  const supAllows = (id, code, slot) => {
    const list = supOf(id); if (!list.length) return true;
    if (BREAK_GRADES[slot]) return list.some(c => BREAK_GRADES[slot].includes(c.slice(1)));  // مراقبة فسحة مرحلته
    return !!code && code.split(' / ').every(c => list.includes(c));
  };
  const emergencyList = () => (db.settings.emergency || '').split('\n').map(x => x.trim()).filter(Boolean);

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

  // ---------------- التخزين السحابي ----------------
  // السجل والإعدادات تنحفظ في قاعدة بيانات البرنامج (لما يكون مفتوح داخل Claude)،
  // ونسخة منها في المتصفح احتياط.
  let cloud = null, cloudWarned = false;
  const writing = new Map(), pendingW = new Map();
  function cloudWrite(path, body) {
    if (!cloud) return;
    if (writing.has(path)) { pendingW.set(path, body); return; }
    const run = async b => {
      writing.set(path, true);
      try { b === null ? await cloud.doc(path).delete() : await cloud.doc(path).set(b); }
      catch (e) {
        if (!cloudWarned) { cloudWarned = true; toast(e && e.code === 'invalid_argument' ? 'ما عندك صلاحية الحفظ — اطلب صلاحية «محرر» من صاحب البرنامج' : 'تعذّر الحفظ في السحابة، محفوظ في هذا الجهاز'); }
      }
      writing.delete(path);
      if (pendingW.has(path)) { const nb = pendingW.get(path); pendingW.delete(path); run(nb); }
    };
    run(body);
  }
  const cloudDay = iso => cloudWrite(`days/${iso}`, db.history[iso] ? JSON.parse(JSON.stringify(db.history[iso])) : null);
  const cloudConfig = () => cloudWrite('config/main', { settings: { ...db.settings }, avail: JSON.parse(JSON.stringify(db.avail)) });
  function setStorageNote() {
    const el = $('#storageNote'); if (!el) return;
    el.textContent = cloud ? '☁︎ السجل محفوظ في السحابة، ويطلع نفسه من أي جهاز.' : 'السجل محفوظ في هذا المتصفح فقط — خذ نسخة احتياطية بين فترة وفترة.';
  }
  async function startCloud() {
    if (!claudeHost) { setStorageNote(); return; }
    let c = null;
    try { c = await window.claude.use('db'); } catch (e) { c = null; }
    if (!c) { setStorageNote(); return; }
    try {
      const [cfg, days] = await Promise.all([c.doc('config/main').get(), c.collection('days').limit(1000).get()]);
      cloud = c;
      if (!cfg.exists && days.empty) {
        // أول تشغيل: ارفع اللي في المتصفح
        cloudConfig();
        Object.keys(db.history).forEach(cloudDay);
      } else {
        if (cfg.exists) {
          const v = cfg.data();
          db.settings = { ...defaults().settings, ...(v.settings || {}) };
          db.avail = JSON.parse(JSON.stringify(v.avail || {}));
        }
        db.history = {};
        days.docs.forEach(d => { if (d.exists) db.history[d.id] = JSON.parse(JSON.stringify(d.data())); });
        persist();
        renderSettings(); loadDate(date);
        if (document.querySelector('.tab.active')?.dataset.tab === 'stats') renderStats();
      }
      // تحديث مباشر لو أحد ثاني عدّل من جهاز ثاني
      c.collection('days').limit(1000).onSnapshot(snap => {
        let touched = false;
        snap.docChanges().forEach(ch => {
          if (ch.doc.metadata.hasPendingWrites || writing.has(`days/${ch.doc.id}`)) return;
          const iso = ch.doc.id;
          const val = ch.type === 'removed' ? null : JSON.parse(JSON.stringify(ch.doc.data()));
          if (JSON.stringify(val) === JSON.stringify(db.history[iso] || null)) return;
          if (val) db.history[iso] = val; else delete db.history[iso];
          touched = true;
          if (iso === date) loadDate(date);
        });
        if (touched) { persist(); if (document.querySelector('.tab.active')?.dataset.tab === 'stats') renderStats(); }
      }, () => {});
    } catch (e) { cloud = null; }
    setStorageNote();
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
    document.dispatchEvent(new CustomEvent('apt:day', { detail: 'load' }));
  }
  // الحفظ تلقائي مع كل تغيير
  function commit() {
    const has = Object.keys(state.absent).length || state.swaps.length;
    if (has) db.history[date] = { ...JSON.parse(JSON.stringify(state)), savedAt: new Date().toISOString() };
    else delete db.history[date];
    persist(); cloudDay(date);
    $('#savedFlag').hidden = !has;
    document.dispatchEvent(new CustomEvent('apt:day'));
  }

  // ---------------- الجدول الفعلي لليوم (بعد التبديلات) ----------------
  function context(st = state, skipItem = null) {
    const d = D();
    const ov = new Map();   // "tid|slot" -> cell أو null
    const out = new Map();  // tid -> [فترات] خارج المدرسة (استئذان)
    for (const sw of st.swaps) {
      out.set(sw.a, [...(out.get(sw.a) || []), winOf(sw)]);
      for (const it of sw.items) {
        if (it === skipItem || !it.b) continue;
        ov.set(`${sw.a}|${it.s}`, null);
        ov.set(`${sw.a}|${it.s2}`, { c: it.c, t: it.t, swap: true });
        ov.set(`${it.b}|${it.s2}`, null);
        ov.set(`${it.b}|${it.s}`, { c: it.c, t: it.t2, swap: true });
      }
    }
    const cell = (tid, s) => { const k = `${tid}|${s}`; return ov.has(k) ? ov.get(k) : byId[tid].cells[`${d}-${s}`] || null; };
    const isOutIv = (tid, iv) => (out.get(tid) || []).some(w => overlap(w, iv));
    // مشغول إذا عنده أي شي يتداخل وقته مع هالفترة
    const busyIv = (tid, iv) => SLOT_ORDER.some(s => { const c = cell(tid, s); return c && overlap(ivOf(s, c.c), iv); });
    const absentSet = new Set(Object.keys(st.absent));
    return { d, cell, isOutIv, busyIv, absentSet };
  }
  // وقت خروج المستأذن [بداية، نهاية]
  function winOf(sw) {
    if (sw.win) return sw.win;
    if (sw.mode === 'from' && sw.from) return [startOf(sw.from, false), sw.to && sw.to !== 'end' ? startOf(sw.to, true) : 9999];
    const ivs = (sw.slots || []).map(s => TIMES[s] || ivOf(s, ''));
    return ivs.length ? [Math.min(...ivs.map(x => x[0])), Math.max(...ivs.map(x => x[1]))] : [0, 0];
  }
  const dayCells = (ctx, tid) => SLOT_ORDER.map(s => ({ s, cell: ctx.cell(tid, s) })).filter(x => x.cell);
  const coverable = cell => !NON_TEACHING.has(cell.t) || (cell.t === 'مراقبة' && db.settings.coverBreak);

  // ---------------- العدّ من السجل ----------------
  function historyCounts(excludeDate) {
    const cnt = {}, abs = {}, last = {}, swA = {}, swB = {}, ref = {}, duty = {};
    let emg = 0;
    for (const [iso, h] of Object.entries(db.history)) {
      if (iso === excludeDate) continue;
      for (const r of h.rows || []) (r.refused || []).forEach(x => { ref[x] = (ref[x] || 0) + 1; });
      for (const r of h.rows || []) if (r.sub && isE(r.sub)) emg++;
      for (const r of h.rows || []) if (r.sub && !isE(r.sub) && BREAKS.has(r.slot)) duty[r.sub] = (duty[r.sub] || 0) + 1;
      for (const r of h.rows || []) if (r.sub && !isE(r.sub)) { cnt[r.sub] = (cnt[r.sub] || 0) + 1; if (!last[r.sub] || iso > last[r.sub]) last[r.sub] = iso; }
      for (const tid of Object.keys(h.absent || {})) abs[tid] = (abs[tid] || 0) + 1;
      for (const sw of h.swaps || []) {
        swA[sw.a] = (swA[sw.a] || 0) + 1;
        for (const it of sw.items) if (it.b) swB[it.b] = (swB[it.b] || 0) + 1;
      }
    }
    return { cnt, abs, last, swA, swB, ref, emg, duty };
  }

  // ---------------- التبديل ----------------
  // خيارات التبديل لحصة المعلم a في الحصة s: زميل يدرّس نفس الصف في نفس اليوم
  function swapOptions(sw, it, hist) {
    const ctx = context(state, it);
    const a = sw.a;
    const covering = new Set(state.rows.map(r => r.sub).filter(Boolean));
    const opts = [];
    for (const b of T) {
      if (b.id === a || !presentOn(b, ctx.d) || ctx.absentSet.has(b.id)) continue;
      const ivS = ivOf(it.s, it.c);
      if (ctx.busyIv(b.id, ivS) || ctx.isOutIv(b.id, ivS)) continue; // البديل لازم يكون فاضي وقت حصة صاحب الطلب
      for (const s2 of TEACH_SLOTS) {
        if (s2 === it.s) continue;
        const bc = ctx.cell(b.id, s2);
        if (!bc || bc.swap || NON_TEACHING.has(bc.t) || bc.c !== it.c) continue;
        const iv2 = ivOf(s2, it.c);
        if (overlap(iv2, winOf(sw))) continue;                         // صاحب الطلب برا المدرسة وقتها
        if (ctx.busyIv(a, iv2) || ctx.isOutIv(b.id, iv2)) continue;    // صاحب الطلب فاضي وقتها
        opts.push({ b: b.id, s2, t2: bc.t, covering: covering.has(b.id), key: [covering.has(b.id) ? 1 : 0, hist.swB[b.id] || 0, Math.abs(slotIdx(s2) - slotIdx(it.s)), b.teaching] });
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
        if (db.settings.swapMode === 'manual' && !it.m) { Object.assign(it, { b: '', s2: '', t2: '' }); continue; }
        const best = opts[0];
        Object.assign(it, best ? { b: best.b, s2: best.s2, t2: best.t2 } : { b: '', s2: '', t2: '' });
      }
    }
  }

  // ---------------- التأمين ----------------
  function needs(ctx) {
    const list = [];
    for (const [tid, slots] of Object.entries(state.absent)) {
      for (const { s, cell } of dayCells(ctx, tid)) if (slots.includes(s) && coverable(cell)) list.push({ slot: s, c: cell.c, t: cell.post ? `مراقبة — ${cell.post}` : cell.t, absent: tid, kind: 'abs' });
    }
    for (const sw of state.swaps) {
      if (ctx.absentSet.has(sw.a)) continue;
      for (const it of sw.items) if (!it.b && (it.none || db.settings.swapMode !== 'manual')) list.push({ slot: it.s, c: it.c, t: it.t, absent: sw.a, kind: 'out' });
      // مراقبة الفسحة اللي تصادف وقت خروجه
      if (db.settings.coverBreak) for (const s of ['B1', 'B2']) {
        const c = ctx.cell(sw.a, s);
        if (c && c.t === 'مراقبة' && overlap(TIMES[s], winOf(sw))) list.push({ slot: s, c: '', t: c.post ? `مراقبة — ${c.post}` : c.t, absent: sw.a, kind: 'out' });
      }
    }
    return list;
  }

  // أطول سلسلة متتالية: الحصص + مراقبة الفسحة (الفسحة بدون مراقبة تقطع السلسلة)
  function runAfter(ctx, tid, s, extra) {
    const has = x => { const c = ctx.cell(tid, x); return BREAKS.has(x) ? !!c && c.t === 'مراقبة' : !!c; };
    const teach = new Set(SLOT_ORDER.filter(has));
    extra.forEach(x => teach.add(x)); teach.add(s);
    let best = 0, run = 0;
    for (const x of SLOT_ORDER) { run = teach.has(x) ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  }

  function candidates(row, rows, hist, ctx) {
    const s = row.slot, iv = ivOf(s, row.c);
    const absT = byId[row.absent];
    const taken = new Set(rows.filter(r => r !== row && r.sub && overlap(ivOf(r.slot, r.c), iv)).map(r => r.sub));
    const isB = BREAKS.has(s);
    const tc = {}, extra = {}, all = {};
    rows.forEach(r => { if (r !== row && r.sub) { all[r.sub] = (all[r.sub] || 0) + 1; if (BREAKS.has(r.slot) === isB) tc[r.sub] = (tc[r.sub] || 0) + 1; (extra[r.sub] = extra[r.sub] || []).push(r.slot); } });
    // سقف قاطع: لا يُعطى المعلم أكثر من تأمينين في اليوم (التأمين + المراقبة معًا)
    const CAP = Math.max(2, db.settings.maxPerDay || 1);
    const list = T.filter(t => !NO_COVER.has(t.id) && (all[t.id] || 0) < CAP && presentOn(t, ctx.d) && !ctx.absentSet.has(t.id) && !ctx.isOutIv(t.id, iv) && !ctx.busyIv(t.id, iv) && !taken.has(t.id) && !(row.refused || []).includes(t.id) && supAllows(t.id, row.c, s));
    const inSwap = new Set(state.swaps.flatMap(sw => [sw.a, ...sw.items.map(it => it.b)]).filter(Boolean));
    const manS = new Set(db.settings.manualOnly || []), coS = new Set(db.settings.coords || []);
    const minHist = list.length ? Math.min(...list.map(t => hist.cnt[t.id] || 0)) : 0;
    return list.map(t => {
      const h = hist.cnt[t.id] || 0, n = tc[t.id] || 0, same = t.dept === absT.dept;
      const load = dayCells(ctx, t.id).filter(x => !NON_TEACHING.has(x.cell.t)).length;
      const run = runAfter(ctx, t.id, s, extra[t.id] || []);
      const nAll = all[t.id] || 0;
      const man = manS.has(t.id), coord = coS.has(t.id);
      if (isB) {
        // بديل المراقبة: ما يكون عنده حصة قبل الفسحة أو بعدها مباشرة، ثم معلمو المراقبة، والأخف نصابًا، وواحدة باليوم
        const i = SLOT_ORDER.indexOf(s), nb = [SLOT_ORDER[i - 1], SLOT_ORDER[i + 1]].filter(Boolean);
        const ex = extra[t.id] || [];
        const adjS = nb.filter(x => ex.includes(x) || (ctx.cell(t.id, x) && !NON_TEACHING.has(ctx.cell(t.id, x).t)));
        const adj = adjS.length;
        const over = n >= 1 || nAll >= db.settings.maxPerDay, duty = DUTY_T.has(t.id), consec = db.settings.avoidConsec && run >= 4 ? 1 : 0;
        return { t, h, n, nAll, same, load, run, over, duty, adj, adjS, man, coord, swp: inSwap.has(t.id), key: [man ? 1 : 0, over ? 1 : 0, coord ? 1 : 0, adj, consec, duty ? 0 : 1, load, t.teaching, hist.duty[t.id] || 0, h] };
      }
      const over = n >= db.settings.maxPerDay || nAll >= db.settings.maxPerDay;
      const deptTier = db.settings.deptFirst && same && h - minHist <= 2 ? 0 : 1;
      const consec = db.settings.avoidConsec && run >= 4 ? 1 : 0;
      return { t, h, n, nAll, same, load, run, over, man, coord, swp: inSwap.has(t.id), key: [man ? 1 : 0, over ? 1 : 0, coord ? 1 : 0, nAll, inSwap.has(t.id) ? 1 : 0, consec, deptTier, h, load, t.total] };
    }).sort((a, b) => sortKey(a.key, b.key) || a.t.name.localeCompare(b.t.name, 'ar'));
  }

  function emergencyFree(row, rows) {
    const iv = ivOf(row.slot, row.c);
    const taken = new Set(rows.filter(r => r !== row && r.sub && overlap(ivOf(r.slot, r.c), iv)).map(r => r.sub));
    return emergencyList().map(n => 'E:' + n).filter(id => !taken.has(id));
  }
  // يختار للحصة الأنسب، وإذا ما فيه أحد يروح للطوارئ
  function assignOne(r, rows, hist, ctx) {
    // الأصل تأمين واحد باليوم؛ وإذا ما فيه أحد، للضرورة القصوى يُعطى تأمين ثانٍ مع تنبيه للإداري، وبعدها الإدارة
    const cs = candidates(r, rows, hist, ctx);
    // الرياضة (يدوي فقط) ما تنختار تلقائيًا أبدًا، والمنسق للضرورة قبل التأمين الثاني
    const auto = cs.filter(c => !c.man);
    const best = auto.find(c => !c.over && !c.coord) || auto.find(c => !c.over) || auto[0];
    r.sub = best ? best.t.id : (emergencyFree(r, rows)[0] || '');
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
      return { ...n, sub: !resetManual && old && old.m ? old.sub : '', m: !resetManual && old ? !!old.m : false, refused: old && old.refused ? old.refused : [] };
    });
    // تحقق من صلاحية اليدوي
    rows.filter(r => r.m).forEach(r => { if (r.sub && !(isE(r.sub) ? emergencyFree(r, rows).includes(r.sub) : candidates(r, rows, hist, ctx).some(c => c.t.id === r.sub))) { r.sub = ''; r.m = false; } });
    const pending = rows.filter(r => !r.m);
    pending.forEach(r => { r.sub = ''; });
    while (pending.length && db.settings.coverMode !== 'manual') {
      pending.forEach(r => { const cs = candidates(r, rows, hist, ctx); r._n = cs.filter(c => !c.over && !c.man && !c.coord).length + (cs.some(c => !c.man) ? .5 : 0); });
      pending.sort((a, b) => a._n - b._n || slotIdx(a.slot) - slotIdx(b.slot));
      const r = pending.shift();
      assignOne(r, rows, hist, ctx);
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
        if (!coverable(cell)) return `<span class="pill na" title="لا تحتاج تأمين">${SLOT_NAME[s]}<small>${esc(cell.post || cell.t)}</small></span>`;
        const on = state.absent[id].includes(s);
        return `<button class="pill ${on ? 'on' : ''}" data-pill="${id}" data-s="${s}" aria-pressed="${on}">${SLOT_NAME[s]}<small>${cell.c ? codeHTML(cell.c) + ' ' : ''}${esc(cell.post || cell.t)}</small></button>`;
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

  const RANK = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
  function renderModes() {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', db.settings[b.dataset.key] === b.dataset.mode));
    $('#coverModeNote').textContent = db.settings.coverMode === 'manual' ? 'اختر لكل حصة من المرتّبين حسب الأولوية (الأول هو الأنسب).' : 'النظام يختار الأنسب تلقائيًا، وتقدر تغيّر أي حصة بضغطة.';
    $('#swapModeNote').textContent = db.settings.swapMode === 'manual' ? 'اختر البديل لكل حصة من المرتّبين حسب الأولوية.' : 'النظام يختار أنسب بديل تلقائيًا، وتقدر تغيّره.';
  }
  // ملاحظة المرشّح بكلام بسيط
  const candNote = (c, r) => [c.same ? 'نفس القسم' : c.t.dept, c.h ? `أمّن سابقًا ${arNum(c.h)} ${c.h > 2 ? 'مرات' : 'مرة'}` : 'ما أمّن سابقًا', `نصابه اليوم ${arNum(c.load)} ${c.load > 2 && c.load < 11 ? 'حصص' : 'حصة'}`, c.swp ? 'عنده تبديل اليوم' : ''].filter(Boolean).join('، ');
  const candWarn = (c, r, all) => [all && c.man ? 'معلم رياضة — اختيار يدوي من الإدارة' : '', c.coord ? 'منسق القسم — للضرورة فقط' : '', c.over ? `${c.nAll ? 'تأمين ثانٍ اليوم' : 'مراقبة ثانية'} — للضرورة فقط` : '', c.adj ? `عنده حصة ${c.adjS.map(x => slotIdx(x) < slotIdx(r.slot) ? 'قبل' : 'بعد').join(' و')} الفسحة` : '', all && c.run >= 4 ? `${arNum(c.run)} حصص متتالية` : ''].filter(Boolean);
  function rowInfo(r, i, hist, ctx) {
    const cands = candidates(r, state.rows, hist, ctx);
    const cur = cands.find(c => c.t.id === r.sub);
    const warns = cur ? candWarn(cur, r) : [];
    const st = !r.sub ? 'missing' : warns.length ? 'warn' : isE(r.sub) ? 'emg' : 'ok';
    return { cands, cur, warns, st };
  }
  function renderSummary() {
    const rows = state.rows, hist = historyCounts(date), ctx = context();
    const absN = Object.keys(state.absent).length + new Set(rows.filter(r => r.kind === 'out').map(r => r.absent)).size;
    let done = 0, need = 0, warn = 0;
    rows.forEach((r, i) => { const x = rowInfo(r, i, hist, ctx); if (r.sub) done++; if (x.st === 'missing') need++; if (x.st === 'warn') warn++; });
    const sentBtn = document.querySelector('[data-send-now]'), sent = !!(sentBtn && sentBtn.classList.contains('done'));
    const s1 = absN ? 'done' : 'cur', s2 = !rows.length ? '' : need ? 'cur' : 'done', s3 = rows.length && !need ? (sent ? 'done' : 'cur') : '';
    $('#daySum').innerHTML = `<ol class="stepper">
        <li class="${s1}" data-go="absCard"><i>١</i><span>الغائبون</span></li>
        <li class="${s2}" data-go="resultCard"><i>٢</i><span>التأمين</span></li>
        <li class="${s3}" data-go="sendBar"><i>٣</i><span>الإرسال</span></li>
      </ol>
      <div class="sumnums">
        <div><b>${arNum(absN)}</b><span>غائب</span></div>
        <div><b>${arNum(done)}<small>/${arNum(rows.length)}</small></b><span>حصة مؤمّنة</span></div>
        ${need ? `<div class="need bad" data-go="firstNeed"><b>${arNum(need)}</b><span>بدون مؤمّن</span></div>` : ''}
        ${warn ? `<div class="need" data-go="firstWarn"><b>${arNum(warn)}</b><span>للضرورة ⚠</span></div>` : ''}
        ${!need && !warn ? `<div class="calm"><b>✓</b><span>كله تمام</span></div>` : ''}
        <div class="${sent ? 'calm' : ''}"><b>${sent ? '✓' : '—'}</b><span>${sent ? 'انرسل للمعلمين' : 'لم يُرسل'}</span></div>
      </div>`;
  }
  function renderResults() {
    renderModes();
    const rows = state.rows;
    $('#resultCard').hidden = !rows.length;
    renderSummary();
    if (!rows.length) { $('#loadToday').innerHTML = ''; return; }
    const hist = historyCounts(date), ctx = context();
    const seen = {};
    $('#resTable').innerHTML = groupRows(rows).map(g => {
      const infos = g.rows.map(({ r, i }) => ({ r, i, ...rowInfo(r, i, hist, ctx) }));
      const ok = infos.filter(x => x.r.sub).length;
      const head = `<header class="cv-head"><div><b>${esc(nm(g.absent))}</b><span class="cv-kind">${g.kind === 'out' ? 'مستأذن' : 'غائب'}</span></div><small>${esc(byId[g.absent].dept)} · ${arNum(g.rows.length)} ${g.rows.length > 2 ? 'حصص' : 'حصة'}</small><span class="cv-prog ${ok === infos.length ? 'full' : ''}">${arNum(ok)}/${arNum(infos.length)}</span></header>`;
      return `<section class="cv-grp">${head}${infos.map(({ r, i, cur, warns, st }) => {
        const sp = slotPlain(r.slot, r.c);
        const duty = BREAKS.has(r.slot);
        const anchor = st === 'missing' && !seen.m ? (seen.m = 1, ' id="firstNeed"') : st === 'warn' && !seen.w ? (seen.w = 1, ' id="firstWarn"') : '';
        const who = !r.sub ? `<b class="nobody">لم يُحدَّد مؤمّن</b><small>اضغط «اختر» وحدد من القائمة</small>`
          : `<b>${esc(nm(r.sub))}</b><small>${isE(r.sub) ? 'الإدارة تؤمّن هذي الحصة' : cur ? esc(candNote(cur, r)) : ''}${r.m ? ' · اختيارك' : ''}${(r.refused || []).length ? ` · اعتذر: ${esc(r.refused.map(nm).join('، '))}` : ''}</small>`;
        return `<div class="cv-row st-${st}"${anchor}>
          <div class="cv-slot"><b>${esc(sp.name)}</b><small><bdi dir="ltr">${sp.time}</bdi></small></div>
          <div class="cv-class">${duty ? `<span class="cv-duty">مراقبة</span><small>${esc(r.t.replace(/^مراقبة\s*[—-]?\s*/, '') || '')}</small>` : `<b>${codeHTML(r.c)}</b><small>${esc(r.t)}</small>`}</div>
          <div class="cv-sub">${who}${warns.map(w => `<em class="cv-warn">⚠ ${esc(w)}</em>`).join('')}</div>
          <button class="cv-btn ${r.sub ? '' : 'pri'}" data-chg="${i}">${r.sub ? 'تغيير' : 'اختر'}</button>
        </div>`;
      }).join('')}</section>`;
    }).join('');
    const cnt = {};
    rows.forEach(r => { if (r.sub) cnt[r.sub] = (cnt[r.sub] || 0) + 1; });
    const lt = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<span class="lt">${esc(nm(id))} <b>${arNum(n)}</b></span>`).join('');
    $('#loadToday').innerHTML = lt ? `<details><summary>عبء اليوم على المعلمين (${arNum(Object.keys(cnt).length)})</summary><div class="lt-list">${lt}</div></details>` : '';
  }

  // نافذة اختيار المؤمّن
  let pickRow = -1, pickAll = false;
  function renderPick() {
    const r = state.rows[pickRow]; if (!r) return;
    const hist = historyCounts(date), ctx = context();
    const cs = candidates(r, state.rows, hist, ctx);
    const manL = cs.filter(c => c.man), base = cs.filter(c => !c.man);
    const list = [...base.filter(c => !c.over && !c.coord), ...base.filter(c => !c.over && c.coord), ...base.filter(c => c.over)];
    const shown = pickAll ? list : list.slice(0, 5);
    const sp = slotPlain(r.slot, r.c);
    $('#pkHead').innerHTML = `<small>بدل ${esc(nm(r.absent))}</small><b>الحصة ${esc(sp.name)} · ${BREAKS.has(r.slot) ? 'مراقبة' : codeHTML(r.c)}</b><small>${esc(r.t)} · <bdi dir="ltr">${sp.time}</bdi></small>`;
    const item = (c, k) => {
      const w = candWarn(c, r, true);
      return `<button class="pk ${c.t.id === r.sub ? 'on' : ''} ${w.length ? 'has-w' : ''}" data-pk="${c.t.id}"><i>${arNum(k + 1)}</i><span><b>${esc(c.t.name)}${k === 0 && !w.length ? ' <u>الأنسب</u>' : ''}</b><small>${esc(candNote(c, r))}</small>${w.map(x => `<em>⚠ ${esc(x)}</em>`).join('')}</span>${c.t.id === r.sub ? '<s>✓</s>' : ''}</button>`;
    };
    const emg = emergencyFree(r, state.rows);
    if (isE(r.sub) && !emg.includes(r.sub)) emg.unshift(r.sub);
    $('#pkList').innerHTML = (shown.map(item).join('') || '<p class="muted">ما فيه معلم متاح في هذي الحصة.</p>')
      + (list.length > 5 && !pickAll ? `<button class="pk-more" data-pkall>عرض الباقين (${arNum(list.length - 5)})</button>` : '')
      + (manL.length ? `<h4>معلمو الرياضة — اختيار يدوي فقط</h4>${manL.map((c, k) => item(c, list.length + k)).join('')}` : '')
      + (emg.length ? `<h4>أو الإدارة تؤمّن</h4><div class="pk-emg">${emg.map(id => `<button class="pk sm ${id === r.sub ? 'on' : ''}" data-pk="${esc(id)}"><span><b>🛡 ${esc(nm(id))}</b></span>${id === r.sub ? '<s>✓</s>' : ''}</button>`).join('')}</div>` : '');
    $('#pkRefuse').hidden = !(r.sub && !isE(r.sub));
    $('#pkRefuse').textContent = r.sub ? `${nm(r.sub)} اعتذر ← حوّل للتالي` : '';
    $('#pkNone').hidden = !r.sub;
  }
  function openPick(i) { pickRow = i; pickAll = false; renderPick(); $('#pickModal').hidden = false; }
  function closePick() { $('#pickModal').hidden = true; pickRow = -1; }

  // ---------------- العرض: التبديل ----------------
  // وقت الخروج: من بداية حصة إلى ما قبل حصة الرجوع (أو نهاية الدوام)
  let swDraft = { a: '', from: '', to: 'end' };
  const newDraft = (a = '') => ({ a, from: '', to: 'end' });
  function renderSwapForm() {
    const ctx = context();
    const busyA = new Set(state.swaps.map(s => s.a));
    const opts = deptOrder.map(dep => {
      const ts = T.filter(t => t.dept === dep && presentOn(t, ctx.d) && !ctx.absentSet.has(t.id) && !busyA.has(t.id));
      return ts.length ? `<optgroup label="${esc(dep)}">${ts.map(t => `<option value="${t.id}" ${t.id === swDraft.a ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    if (swDraft.a && (busyA.has(swDraft.a) || ctx.absentSet.has(swDraft.a))) swDraft = newDraft();
    $('#swTeacher').innerHTML = `<option value="">— اختر المعلم —</option>${opts}`;
    $('#swTeacher').value = swDraft.a;
    const a = swDraft.a;
    $('#swModeWrap').hidden = !a;
    if (!a) { $('#btnSwap').disabled = true; return; }
    const teach = dayCells(ctx, a).filter(x => !NON_TEACHING.has(x.cell.t));
    if (!swDraft.from) swDraft.from = teach.length ? teach[teach.length - 1].s : '7';
    $('#swFrom').innerHTML = TEACH_SLOTS.map(s => `<option value="${s}">${SLOT_NAME[s]}</option>`).join('');
    $('#swFrom').value = swDraft.from;
    const later = TEACH_SLOTS.filter(s => slotIdx(s) > slotIdx(swDraft.from));
    if (swDraft.to !== 'end' && !later.includes(swDraft.to)) swDraft.to = 'end';
    $('#swTo').innerHTML = `<option value="end">ما يرجع (لنهاية الدوام)</option>` + later.map(s => `<option value="${s}">يرجع الحصة ${SLOT_NAME[s]}</option>`).join('');
    $('#swTo').value = swDraft.to;
    const n = swSlots().length;
    $('#swCount').textContent = n ? `عنده ${arNum(n)} حصة في هالوقت` : 'ما عنده حصص في هالوقت';
    $('#btnSwap').disabled = !n;
  }
  // كل الأوقات اللي يكون فيها برا المدرسة (مع الفسحة)
  function swWindow() {
    return [startOf(swDraft.from || '7', false), swDraft.to === 'end' ? 9999 : startOf(swDraft.to, true)];
  }
  // حصصه التدريسية داخل وقت الخروج
  function swSlots() {
    if (!swDraft.a) return [];
    const win = swWindow();
    return dayCells(context(), swDraft.a).filter(x => !NON_TEACHING.has(x.cell.t) && overlap(ivOf(x.s, x.cell.c), win)).map(x => x.s);
  }
  const swWhen = sw => sw.mode === 'pick' ? 'حصص محددة'
    : `يطلع من الحصة ${SLOT_NAME[sw.from]}${sw.to && sw.to !== 'end' ? ` ويرجع الحصة ${SLOT_NAME[sw.to]}` : ' لنهاية الدوام'}`;

  function renderSwaps() {
    $('#swapBar').hidden = !state.swaps.length;
    const hist = historyCounts(date);
    $('#swapList').innerHTML = state.swaps.map((sw, si) => {
      const when = swWhen(sw);
      const rows = sw.items.map((it, ii) => {
        const all = swapOptions(sw, it, hist);
        const top = all.filter(o => !o.covering).slice(0, 4);
        const picks = top.length ? `<div class="picks">${top.map((o, k) => `<button class="pick ${o.b === it.b && o.s2 === it.s2 ? 'on' : ''}" data-swpick="${si}|${ii}" data-v="${o.b}|${o.s2}"><span class="rk">${RANK[k]}</span>${esc(nm(o.b).replace(/^أ\.\s*/, ''))} <small>(${SLOT_NAME[o.s2]})</small>${k === 0 ? '<i>الأنسب</i>' : ''}</button>`).join('')}</div>` : '';
        const opts = all.map(o => `<option value="${o.b}|${o.s2}" ${o.b === it.b && o.s2 === it.s2 ? 'selected' : ''}>${esc(nm(o.b))}${o.covering ? ' (عنده تأمين اليوم)' : ''}</option>`).join('');
        const sel = `<select data-sw="${si}" data-it="${ii}" aria-label="من يدخل الحصة ${SLOT_NAME[it.s]}"><option value="" ${!it.b && !it.none ? 'selected' : ''}>${db.settings.swapMode === 'manual' && !it.none ? '— اختر البديل —' : '— للتأمين —'}</option>${db.settings.swapMode === 'manual' ? `<option value="__cover" ${it.none ? 'selected' : ''}>— بدون تبديل (يدخل التأمين) —</option>` : ''}${opts}</select>`;
        const first = `<tr class="${it.b ? 'pair-a' : 'missing'}"><td rowspan="${it.b ? 2 : 1}" data-l="الصف">${codeHTML(it.c)}</td><td class="per" data-l="الحصة">${slotLabel(it.s, it.c)}</td><td data-l="المعلم">${it.b ? '<span class="role-tag">البديل</span>' : ''}${picks}${sel}</td></tr>`;
        const second = it.b ? `<tr class="pair-b"><td class="per" data-l="الحصة">${slotLabel(it.s2, it.c)}</td><td data-l="المعلم"><span class="role-tag">المستأذن</span><b>${esc(nm(sw.a))}</b></td></tr>` : '';
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
        g.rows.map(({ r }) => `<tr><td>${arNum(++n)}</td><td>${slotLabel(r.slot, r.c)}</td><td>${r.c ? codeHTML(r.c) : '—'}</td><td>${esc(r.t)}</td>
          <td class="nm">${r.sub ? esc(nm(r.sub)) : '................................'}</td><td class="sig"></td></tr>`).join('')).join('');
      body = `<table class="ps-table">
        <thead><tr><th style="width:6%">م</th><th style="width:11%">الحصة</th><th style="width:10%">الصف</th><th style="width:15%">المادة</th><th>المعلم المؤمِّن</th><th style="width:26%">التوقيع بالعلم</th></tr></thead>
        <tbody>${tbody}</tbody></table>`;
      note = 'نأمل من المعلمين الأفاضل التوقيع بالعلم، والتواجد في الصف بداية الحصة. شاكرين تعاونكم.';
    } else {
      let m = 0;
      const tbody = (data.swaps || []).map(sw => {
        const its = sw.items.filter(it => it.b);
        const n = its.length;
        return its.map((it, i) => `<tr${i === 0 ? ' class="pair"' : ''}><td>${arNum(++m)}</td>
          ${i === 0 ? `<td class="nm" rowspan="${n}">${esc(nm(sw.a))}</td>` : ''}<td>${codeHTML(it.c)}</td><td class="per-cell">${slotLabel(it.s2, it.c)}</td>${i === 0 ? `<td class="sig" rowspan="${n}"></td>` : ''}
          <td class="nm side">${esc(nm(it.b))}</td><td>${codeHTML(it.c)}</td><td class="per-cell">${slotLabel(it.s, it.c)}</td><td class="sig"></td></tr>`).join('');
      }).join('');
      body = `<table class="ps-table">
        <thead><tr><th rowspan="2" style="width:5%">م</th><th colspan="4" class="side-h">المعلم المستأذن</th><th colspan="4" class="side-h side">المعلم البديل</th></tr>
        <tr><th>الاسم</th><th style="width:7%">الصف</th><th style="width:9%">الحصة</th><th style="width:11%">التوقيع</th><th class="side">الاسم</th><th style="width:7%">الصف</th><th style="width:9%">الحصة</th><th style="width:11%">التوقيع</th></tr></thead>
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
      </div>
      <p class="ps-credit">إعداد: أ. طلال سعود المهلهل</p>`;
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
      const cuts = [...sheet.querySelectorAll('tr, .ps-sub, .ps-note, .ps-foot, .ps-credit')].map(el => el.getBoundingClientRect().top - top0);
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
    const { cnt, abs, last, swA, swB, ref, emg } = historyCounts(null);
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
      <div class="kpi"><span>الأكثر تأمينًا</span><b class="kpi-name">${topId ? esc(nm(topId)) : '—'}</b><small>${topId ? arNum(cnt[topId]) + ' حصة' : ''}${missing ? ` · ${arNum(missing)} حصة بلا مؤمِّن` : ''}${emg ? ` · ${arNum(emg)} بالطوارئ` : ''}</small></div>`;
    const sort = $('#statsSort').value;
    const list = T.filter(t => !availOf(t).released || cnt[t.id]);
    list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ar')
      : sort === 'dept' ? deptOrder.indexOf(a.dept) - deptOrder.indexOf(b.dept) || (cnt[b.id] || 0) - (cnt[a.id] || 0)
      : (cnt[b.id] || 0) - (cnt[a.id] || 0) || a.name.localeCompare(b.name, 'ar'));
    const max = Math.max(1, ...Object.values(cnt));
    $('#statsTable').innerHTML = `<thead><tr><th>المعلم</th><th>القسم</th><th>مرات التأمين</th><th>النسبة</th><th></th><th>النصاب الأسبوعي</th><th>العبء</th><th>الغياب</th><th>اعتذار</th><th>تبديل لزميل</th><th>طلب تبديل</th><th>آخر تأمين</th></tr></thead><tbody>${list.map(t => {
      const n = cnt[t.id] || 0, pct = total ? n / total * 100 : 0;
      return `<tr><td><b>${esc(t.name)}</b></td><td class="muted">${esc(t.dept)}</td><td class="num">${arNum(n)}</td><td class="num">${arNum(pct.toFixed(1))}٪</td>
        <td><div class="bar"><i style="width:${n / max * 100}%"></i></div></td><td class="num">${arNum(t.teaching)}</td>
        <td class="num">${t.teaching ? arNum((n / t.teaching * 100).toFixed(0)) + '٪' : '—'}</td><td class="num">${arNum(abs[t.id] || 0)}</td>
        <td class="num">${arNum(ref[t.id] || 0)}</td><td class="num">${arNum(swB[t.id] || 0)}</td><td class="num">${arNum(swA[t.id] || 0)}</td><td class="muted">${last[t.id] ? gHTML(last[t.id]) : '—'}</td></tr>`;
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
        <div class="t-ctrl">${days}<button class="relbtn ${a.released ? 'on' : ''}" data-rel="${t.id}">${a.released ? 'مفرّغ كليًا' : 'تفريغ كلي'}</button><button class="relbtn ${supOf(t.id).length ? 'sup' : ''}" data-sup="${t.id}">${supOf(t.id).length ? 'مشرف' : 'إشراف'}</button><button class="link" data-tt="${t.id}">${openTT.has(t.id) ? 'إخفاء الجدول' : 'الجدول'}</button></div></div>
        ${supOf(t.id).length ? `<p class="sup-note">مشرف على: <b>${esc(supLabel(t.id))}</b> — يأمّن هالصفوف بس</p>` : ''}
        ${openSup.has(t.id) ? supHTML(t) : ''}
        ${openTT.has(t.id) ? ttHTML(t) : ''}</div>`;
    }).join('');
  }
  const openSup = new Set();
  function supHTML(t) {
    const list = supOf(t.id);
    return `<div class="sup-box">${GRADES.map(g => {
      const codes = ALL_CODES.filter(c => c.slice(1) === g);
      const all = codes.every(c => list.includes(c));
      return `<div class="sup-grade"><label class="check"><input type="checkbox" data-supg="${t.id}" data-g="${g}" ${all ? 'checked' : ''}> <b>${GRADE_NAME(g)}</b></label>
        <span class="sup-secs">${codes.map(c => `<label class="check"><input type="checkbox" data-supc="${t.id}" data-c="${c}" ${list.includes(c) ? 'checked' : ''}> ${codeHTML(c)}</label>`).join('')}</span></div>`;
    }).join('')}<small class="muted">إذا ما اخترت شي، المعلم يأمّن أي صف عادي.</small></div>`;
  }
  function setSup(id, list) {
    const sup = { ...(db.settings.supervise || {}) };
    if (list.length) sup[id] = [...new Set(list)].sort(); else delete sup[id];
    db.settings.supervise = sup; persist(); cloudConfig();
  }
  function ttHTML(t) {
    const head = SLOT_ORDER.map(s => `<th>${SLOT_NAME[s]}</th>`).join('');
    const body = DAYS.map((n, d) => `<tr><th>${n}</th>${SLOT_ORDER.map(s => {
      const c = t.cells[`${d}-${s}`];
      if (!c) return `<td class="${BREAKS.has(s) ? 'brk' : ''}"></td>`;
      return `<td class="${BREAKS.has(s) ? 'brk' : ''} ${NON_TEACHING.has(c.t) ? 'meet' : ''}">${c.c ? codeHTML(c.c) : ''}<small>${esc(c.post || c.t)}</small></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="tt table-wrap"><table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ---------------- الإعدادات ----------------
  function renderSettings() {
    const s = db.settings;
    $('#setPrincipal').value = s.principal; $('#setAssistant').value = s.assistant;
    $('#setMax').value = String(s.maxPerDay); $('#setDept').checked = s.deptFirst;
    $('#setBreak').checked = s.coverBreak; $('#setConsec').checked = s.avoidConsec;
    $('#setEmg').value = s.emergency || '';
    renderRoles();
    $('#sourceNote').textContent = `مصدر الجدول: ${window.TIMETABLE.source} — ${T.length} معلمًا`;
  }

  // أدوار خاصة: يدوي فقط (الرياضة) والمنسقون (للضرورة)
  function renderRoles() {
    const box = $('#roleList'); if (!box) return;
    const man = new Set(db.settings.manualOnly || []), co = new Set(db.settings.coords || []);
    const names = ids => ids.length ? ids.map(id => `<span class="rn">${esc(nm(id).replace(/^أ\.\s*/, ''))}</span>`).join('') : '<span class="muted">لا أحد</span>';
    const sups = Object.keys(db.settings.supervise || {}).filter(id => supOf(id).length && byId[id]);
    $('#rolesSum').innerHTML = `
      <div class="rule"><i class="r-nc">⛔</i><div><b>مستثنى من التأمين نهائيًا</b><small>لظرف صحي — ما يدخل التأمين ولا المراقبة أبدًا</small><div class="rns">${names([...NO_COVER].filter(id => byId[id]))}</div></div></div>
      <div class="rule"><i class="r-man">✋</i><div><b>يدوي فقط (التربية الرياضية)</b><small>ما ينختارون تلقائيًا ولا بعد اعتذار أحد — الإدارة تختارهم بنفسها من «تغيير» إذا بغت</small><div class="rns">${names([...man])}</div></div></div>
      <div class="rule"><i class="r-co">⚠</i><div><b>المنسقون والمعلمون الأوائل — للضرورة فقط</b><small>يُجرَّب كل المعلمين قبلهم، ولو اضطر البرنامج يعطيهم تطلع علامة برتقالية</small><div class="rns">${names([...co])}</div></div></div>
      <div class="rule"><i class="r-sup">👁</i><div><b>المشرفون — صفوف إشرافهم فقط</b><small>ما يأمّنون إلا صفوف المراحل اللي يشرفون عليها (وتتعدّل من «المعلمون»)</small><div class="rns">${sups.map(id => `<span class="rn">${esc(nm(id).replace(/^أ\.\s*/, ''))} <small>${esc(supLabel(id))}</small></span>`).join('') || '<span class="muted">لا أحد</span>'}</div></div></div>
      <div class="rule"><i class="r-gen">١</i><div><b>تأمين واحد باليوم للمعلم</b><small>الثاني للضرورة فقط مع تنبيه، والثالث ممنوع نهائيًا (يروح للإدارة)</small></div></div>
      <div class="rule"><i class="r-gen">☕</i><div><b>مراقبة الفسحة</b><small>ما تُعطى لمن عنده حصة قبل الفسحة أو بعدها مباشرة</small></div></div>
      <div class="rule"><i class="r-gen">⚖</i><div><b>القسم أولًا ثم العدل</b><small>نفس قسم الغائب أولًا، ثم الأقل تأمينًا في السجل، ثم الأخف حصصًا في ذلك اليوم</small></div></div>`;
    box.innerHTML = deptOrder.map(dep => `<div class="dept"><h3>${esc(dep)}</h3><div class="chips">${T.filter(t => t.dept === dep).map(t => {
      const st = NO_COVER.has(t.id) ? 'nc' : man.has(t.id) ? 'man' : co.has(t.id) ? 'co' : '';
      const lbl = { nc: 'مستثنى', man: 'يدوي فقط', co: 'منسق — للضرورة' }[st] || '';
      return `<button class="chip role ${st}" data-role="${t.id}" ${st === 'nc' ? 'disabled' : ''}>${esc(t.name)}${lbl ? ` <span class="tag">${lbl}</span>` : ''}</button>`;
    }).join('')}</div></div>`).join('');
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('#btnRolesReset')) return;
    db.settings.coords = defaults().settings.coords; db.settings.manualOnly = defaults().settings.manualOnly;
    persist(); cloudConfig(); renderRoles(); recompute(); toast('رجعت القائمة المعتمدة');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-role]'); if (!b) return;
    const id = b.dataset.role, s = db.settings;
    const man = new Set(s.manualOnly || []), co = new Set(s.coords || []);
    // عادي ← منسق ← يدوي فقط ← عادي
    if (co.has(id)) { co.delete(id); man.add(id); } else if (man.has(id)) man.delete(id); else co.add(id);
    s.manualOnly = [...man]; s.coords = [...co]; persist(); cloudConfig();
    renderRoles(); recompute(); toast(`${nm(id)}: ${co.has(id) ? 'منسق — للضرورة فقط' : man.has(id) ? 'يدوي فقط' : 'عادي'}`);
  });

  // ---------------- الأحداث ----------------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    $('#dateArea').hidden = !(name === 'today' || name === 'swaps' || name === 'app');
    document.dispatchEvent(new CustomEvent('apt:tab', { detail: name }));
    if (name === 'stats') renderStats();
    if (name === 'teachers') renderTeachers();
    if (name === 'settings') renderSettings();
    if (name === 'today' || name === 'swaps') renderAll();
    try { localStorage.setItem(STORE + '-tab', name); } catch (e) { }
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  $('#dateInput').addEventListener('change', e => { if (e.target.value) { swDraft = newDraft(); loadDate(e.target.value); } });
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
  $('#resTable').addEventListener('click', e => { const b = e.target.closest('[data-chg]'); if (b) openPick(+b.dataset.chg); });
  $('#pickModal').addEventListener('click', e => {
    if (e.target.id === 'pickModal' || e.target.closest('[data-pkclose]')) return closePick();
    if (e.target.closest('[data-pkall]')) { pickAll = true; return renderPick(); }
    const r = state.rows[pickRow]; if (!r) return;
    const pk = e.target.closest('[data-pk]');
    if (pk) { r.sub = pk.dataset.pk; r.m = true; commit(); renderResults(); closePick(); toast(`المؤمّن: ${nm(r.sub)}`); return; }
    if (e.target.closest('#pkNone')) { r.sub = ''; r.m = true; commit(); renderResults(); renderPick(); return; }
    if (e.target.closest('#pkRefuse')) {
      r.refused = [...(r.refused || []), r.sub]; r.m = false;
      assignOne(r, state.rows, historyCounts(date), context());
      commit(); renderResults(); renderPick();
      toast(isE(r.sub) ? `ما فيه معلم متاح — انتقلت للإدارة: ${nm(r.sub)}` : r.sub ? `تم التحويل إلى ${nm(r.sub)}` : 'ما فيه أحد متاح لهالحصة');
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#pickModal').hidden) closePick(); });
  $('#daySum').addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (!g) return;
    const el = document.getElementById(g.dataset.go); if (el && !el.hidden) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    db.settings[b.dataset.key] = b.dataset.mode; persist(); cloudConfig();
    recompute(); renderAll(); renderModes();
    toast(b.dataset.mode === 'manual' ? 'صار الاختيار يدوي — اختر من المرتّبين' : 'صار التوزيع تلقائي');
  });
  if (!claudeHost) { $('#btnPrint').hidden = false; $('#btnSwapPrint').hidden = false; }
  $('#btnPrint').addEventListener('click', () => printDay(date, state));
  $('#btnPdf').addEventListener('click', e => pdfDay(date, state, e.currentTarget));

  // التبديل
  $('#swTeacher').addEventListener('change', e => { swDraft = newDraft(e.target.value); renderSwapForm(); });
  $('#swFrom').addEventListener('change', e => { swDraft.from = e.target.value; renderSwapForm(); });
  $('#swTo').addEventListener('change', e => { swDraft.to = e.target.value; renderSwapForm(); });
  $('#btnSwap').addEventListener('click', () => {
    const slots = swSlots(); if (!swDraft.a || !slots.length) return;
    const ctx = context();
    const items = slots.map(s => { const c = ctx.cell(swDraft.a, s); return { s, c: c.c, t: c.t, b: '', s2: '', t2: '' }; });
    state.swaps.push({ a: swDraft.a, mode: 'from', from: swDraft.from, to: swDraft.to, win: swWindow(), reason: $('#swReason').value.trim(), items });
    swDraft = newDraft(); $('#swReason').value = '';
    afterChange();
    const sw = state.swaps[state.swaps.length - 1];
    const ok = sw.items.filter(it => it.b).length;
    toast(ok === sw.items.length ? `تم ترتيب ${arNum(ok)} تبديل` : `تبدّل ${arNum(ok)} من ${arNum(sw.items.length)} — الباقي دخل جدول التأمين`);
  });
  $('#swapList').addEventListener('change', e => {
    const sel = e.target.closest('select[data-sw]'); if (!sel) return;
    const it = state.swaps[+sel.dataset.sw].items[+sel.dataset.it];
    if (sel.value === '__cover') Object.assign(it, { b: '', s2: '', t2: '', m: true, none: true });
    else if (sel.value) { const [b, s2] = sel.value.split('|'); Object.assign(it, { b, s2, m: true, none: false }); }
    else if (db.settings.swapMode === 'manual') Object.assign(it, { b: '', s2: '', t2: '', m: false, none: false });
    else Object.assign(it, { b: '', s2: '', t2: '', m: true, none: true });
    afterChange();
  });
  $('#btnSwapPdf').addEventListener('click', e => pdfDay(date, state, e.currentTarget, 'swap'));
  $('#btnSwapPrint').addEventListener('click', () => printDay(date, state, 'swap'));
  $('#swapList').addEventListener('click', async e => {
    const p = e.target.closest('[data-swpick]');
    if (p) {
      const [si, ii] = p.dataset.swpick.split('|').map(Number), it = state.swaps[si].items[ii];
      const [b, s2] = p.dataset.v.split('|');
      Object.assign(it, { b, s2, m: true, none: false });
      afterChange(); return;
    }
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
      delete db.history[d.dataset.del]; persist(); cloudDay(d.dataset.del);
      if (d.dataset.del === date) state = emptyDay();
      renderStats();
    }
  });

  $('#tSearch').addEventListener('input', renderTeachers);
  $('#teacherList').addEventListener('change', e => {
    const g = e.target.closest('[data-supg]'), c = e.target.closest('[data-supc]');
    if (!g && !c) return;
    const id = (g || c).dataset.supg || (g || c).dataset.supc;
    let list = supOf(id).slice();
    if (g) { const codes = ALL_CODES.filter(x => x.slice(1) === g.dataset.g); list = g.checked ? [...list, ...codes] : list.filter(x => !codes.includes(x)); }
    else list = c.checked ? [...list, c.dataset.c] : list.filter(x => x !== c.dataset.c);
    setSup(id, list); renderTeachers();
  });
  $('#teacherList').addEventListener('click', e => {
    const dt = e.target.closest('[data-tday]'), rel = e.target.closest('[data-rel]'), tt = e.target.closest('[data-tt]'), sp = e.target.closest('[data-sup]');
    if (sp) { openSup.has(sp.dataset.sup) ? openSup.delete(sp.dataset.sup) : openSup.add(sp.dataset.sup); renderTeachers(); return; }
    if (dt) {
      const t = byId[dt.dataset.tday], a = { ...availOf(t) }, d = +dt.dataset.d;
      a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d].sort();
      db.avail[t.id] = a; persist(); cloudConfig();
    } else if (rel) {
      const t = byId[rel.dataset.rel], a = { ...availOf(t) };
      a.released = !a.released; db.avail[t.id] = a; persist(); cloudConfig();
    } else if (tt) { openTT.has(tt.dataset.tt) ? openTT.delete(tt.dataset.tt) : openTT.add(tt.dataset.tt); }
    else return;
    renderTeachers();
  });

  const bindSetting = (sel, key, fn) => $(sel).addEventListener('change', e => { db.settings[key] = fn(e.target); persist(); cloudConfig(); });
  bindSetting('#setPrincipal', 'principal', el => el.value.trim());
  bindSetting('#setAssistant', 'assistant', el => el.value.trim());
  bindSetting('#setMax', 'maxPerDay', el => +el.value);
  bindSetting('#setDept', 'deptFirst', el => el.checked);
  bindSetting('#setBreak', 'coverBreak', el => el.checked);
  bindSetting('#setConsec', 'avoidConsec', el => el.checked);
  bindSetting('#setEmg', 'emergency', el => el.value);

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
      const old = Object.keys(JSON.parse(localStorage.getItem(STORE) || '{}').history || {});
      persist(); cloudConfig(); old.forEach(iso => { if (!db.history[iso]) cloudWrite(`days/${iso}`, null); }); Object.keys(db.history).forEach(cloudDay);
      renderSettings(); loadDate(date); toast('تم الاسترجاع');
    } catch (err) { toast('الملف غير صالح'); }
  });
  $('#btnReset').addEventListener('click', async () => {
    if (!(await ask('مسح كل سجل التأمين والإحصائيات؟ (الإعدادات تبقى)', 'مسح'))) return;
    const gone = Object.keys(db.history); db.history = {}; persist(); gone.forEach(iso => cloudWrite(`days/${iso}`, null)); loadDate(date); toast('تم مسح السجل');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) $('#modalNo').click(); });

  // ---------------- واجهة للتطبيق الثلاثي (sync-admin.js) ----------------
  window.APT = {
    T, byId, nm, isE, DAYS, slotPlain, supOf, supAllows, supLabel, BREAK_GRADES, weekdayName, fmtG, fmtH, isoOf, toast, ask, esc,
    get date() { return date; },
    get state() { return state; },
    get settings() { return db.settings; },
    refreshSum() { if (D() !== -1) renderSummary(); },
    saveSettings() { persist(); cloudConfig(); },
    // البدلاء بالترتيب لصف تأمين (بدون اللي عندهم الحد اليومي)
    ranked(row) { const cs = candidates(row, state.rows, historyCounts(date), context()).filter(c => !c.man); return [...cs.filter(c => !c.over && !c.coord), ...cs.filter(c => !c.over && c.coord), ...cs.filter(c => c.over)].map(c => c.t.id); },
    // طلب تبديل من معلم (من التطبيق): يرتّبه تلقائيًا بنفس قواعد التبديل، ويفضّل الزميل المقترح إن أمكن
    swapRequest(iso, a, slots, reason, prefer) {
      if (iso !== date) { $('#dateInput').value = iso; swDraft = newDraft(); loadDate(iso); }
      if (D() === -1) return { err: 'هذا اليوم ما فيه دوام.' };
      if (state.swaps.some(x => x.a === a)) return { err: `${nm(a)} عنده تبديل مسجّل في هذا اليوم — عدّله من «التبديل والاستئذان».` };
      const ctx = context();
      if (ctx.absentSet.has(a)) return { err: `${nm(a)} مسجّل غائب في هذا اليوم.` };
      const own = slots.filter(x => { const c = ctx.cell(a, x); return c && !NON_TEACHING.has(c.t); });
      if (!own.length) return { err: `${nm(a)} ما عنده حصص تدريس في الحصص المطلوبة (${slots.map(x => SLOT_NAME[x]).join('، ')}).` };
      const items = own.map(x => { const c = ctx.cell(a, x); return { s: x, c: c.c, t: c.t, b: '', s2: '', t2: '' }; });
      const sw = { a, mode: 'pick', slots: own, reason: 'طلب المعلم: ' + reason, items, req: true };
      state.swaps.push(sw);
      const hist = historyCounts(date), pref = (prefer || '').replace(/^أ\.?\s*/, '').trim();
      const used = new Set();
      for (const it of items) {
        const opts = swapOptions(sw, it, hist).filter(o => !o.covering && !used.has(o.b + '|' + o.s2));
        const best = (pref && opts.find(o => nm(o.b).includes(pref))) || opts[0];
        if (best) { Object.assign(it, { b: best.b, s2: best.s2, t2: best.t2, m: true, none: false }); used.add(best.b + '|' + best.s2); }
      }
      afterChange();
      const res = sw.items.map(it => it.b
        ? { ok: true, txt: `حصتك ${SLOT_NAME[it.s]} (${it.c}) يدخلها ${nm(it.b)}، وتدخل أنت حصته ${SLOT_NAME[it.s2]}` }
        : { ok: false, txt: `حصتك ${SLOT_NAME[it.s]} (${it.c}): ما فيه زميل متاح للتبديل، وتُغطّى بالتأمين` });
      const skipped = slots.filter(x => !own.includes(x)).map(x => SLOT_NAME[x]);
      return { result: res, skipped };
    },
    openSwap() { document.querySelector('.tab[data-tab="swaps"]').click(); },
    swapRanked(sw, it) { return swapOptions(sw, it, historyCounts(date)).filter(o => !o.covering).map(o => ({ b: o.b, s2: o.s2, t2: o.t2 })); },
    // يطبّق رد معلم: اعتذار (يضاف للمعتذرين) والبديل الجديد اللي اختاره التطبيق
    applyRefusal(iso, key, refused, next) {
      if (iso !== date) return false;
      let changed = false;
      if (key.kind === 'swap') {
        const sw = state.swaps.find(x => x.a === key.absent); const it = sw && sw.items.find(x => x.s === key.slot);
        if (!it) return false;
        if (next && next.b && (it.b !== next.b || it.s2 !== next.s2)) { Object.assign(it, { b: next.b, s2: next.s2, t2: next.t2 || '', m: true, none: false }); changed = true; }
        if (!next && it.b && refused.includes(it.b)) { Object.assign(it, { b: '', s2: '', t2: '', m: false, none: true }); changed = true; }
      } else {
        const r = state.rows.find(x => x.absent === key.absent && x.slot === key.slot); if (!r) return false;
        const merged = [...new Set(refused)];
        if (JSON.stringify(merged) !== JSON.stringify(r.refused || [])) { r.refused = merged; changed = true; }
        if (next && r.sub !== next) { r.sub = next; r.m = true; changed = true; }
        if (!next && r.sub && merged.includes(r.sub)) { r.sub = ''; r.m = false; changed = true; }
      }
      if (changed) { recompute(); renderAll(); }
      return changed;
    }
  };

  // ---------------- البداية ----------------
  renderHeroDate();
  startCloud();
  renderSettings();
  const start = new Date();
  while (start.getDay() > 4) start.setDate(start.getDate() + 1);
  loadDate(isoOf(start));
  try {
    const tab = localStorage.getItem(STORE + '-tab');
    if (tab && document.querySelector(`.tab[data-tab="${tab}"]`)) showTab(tab);
  } catch (e) { }
})();
