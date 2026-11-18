// حارس الإشعارات — نسخة Google Apps Script (بديل GitHub Actions)
// يشتغل كل دقيقة (5:30ص–2:30م بتوقيت البحرين، الأحد–الخميس): يقرأ assign وmsgs وpeople من Firestore
// ويرسل FCM v1 بصلاحية حساب قوقل نفسه (بدون ملف مفتاح). الحالة في pushlog، والنبض في people/_guard.
// الدوال اللي تشغّلها بيدك من المحرر: checkAccess ← testPush ← setupTrigger (وstopTrigger للإيقاف).

const PROJECT = 'ap-taameen';
const TEST_TID = 't3';              // أ. طلال سعود — للإشعار التجريبي
const WIN_FROM = 5 * 60 + 30, WIN_TO = 14 * 60 + 30, DAYS = [0, 1, 2, 3, 4]; // الأحد=0 … الخميس=4
const OVERLAP = 15 * 60e3;          // نافذة تداخل (لو ساعة جوال متأخرة شوي ما يفوت شي)
const SWEEP = 15 * 60e3;            // مسح كامل لتكليفات اليوم وبعده كل 15 دقيقة احتياط
const COUNT_EVERY = 10 * 60e3;      // عدّ الأجهزة للمؤشر كل 10 دقايق
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;

// ================= منطق القرار — منسوخ حرفيًا من tools/push/logic.mjs =================
const FRESH = 12 * 3600e3;
const ms = v => typeof v === 'number' ? v : v && v.toMillis ? v.toMillis() : 0;
const where = a => `${a.kind === 'duty' ? (a.slotName || 'الفسحة') : 'الحصة ' + a.slotName}${a.c ? ' (' + a.c + ')' : ''}${a.time ? ' ' + a.time : ''}`;
const whenOf = (a, today) => a.date === today ? 'اليوم' : (a.day || a.date);
const titleOf = a => a.kind === 'duty' ? '☕ مراقبة فسحة' : a.kind === 'swap' ? '⇄ تبديل حصة' : '🛡️ تكليف تأمين';

// prev = آخر حالة أُبلغ عنها لهذا التكليف {to, sig, nudge, active}
// يرجّع { sends:[{tid,title,body,tag}], next } — next = الحالة الجديدة للحفظ (أو null = لا تغيير)
function decideAssign(a, prev, now, today) {
  const sends = [], tag = a.id, live = a.date >= today;
  const pending = live && a.status === 'pending' && !!a.to;
  const holds = live && !!a.to && (a.status === 'pending' || a.status === 'accepted');
  const sig = [a.to, a.date, a.slot, a.c, a.kind, a.s2 || ''].join('|');
  const nudge = String(a.nudgeAt || '');
  const excused = t => (a.refused || []).includes(t) || (a.released || []).includes(t);
  const msgNew = { tid: a.to, title: titleOf(a), body: `${whenOf(a, today)}: ${where(a)} — افتح التطبيق واضغط «استلمت التكليف»`, tag };
  const next = { to: a.to || '', sig, nudge, holds, status: a.status };
  if (!prev) {
    if (pending && now - ms(a.updatedAt || a.createdAt) < FRESH) sends.push(msgNew);
    return { sends, next };
  }
  const gone = prev.holds && prev.to && prev.to !== (holds ? a.to : '') ? prev.to : '';
  if (gone && live && !excused(gone)) sends.push({ tid: gone, title: a.status === 'cancelled' ? 'تم إلغاء تكليفك' : 'تم إعفاؤك من تكليف', body: `${whenOf(a, today)}: ${where(a)} — ما عليك هالحصة`, tag });
  if (pending) {
    if (prev.to !== a.to || !prev.holds) sends.push(msgNew);
    else if (prev.sig !== sig) sends.push({ tid: a.to, title: '🔄 تحديث على تكليفك', body: `${whenOf(a, today)}: ${where(a)} — افتح التطبيق للتفاصيل`, tag });
    else if (nudge && prev.nudge !== nudge) sends.push({ tid: a.to, title: '⏰ تذكير: ما استلمت تكليفك', body: `${whenOf(a, today)}: ${where(a)} — افتح التطبيق واضغط «استلمت التكليف»`, tag });
  } else if (holds && prev.to === a.to && prev.sig !== sig) {
    sends.push({ tid: a.to, title: '🔄 تحديث على تكليفك', body: `${whenOf(a, today)}: ${where(a)} — افتح التطبيق للتفاصيل`, tag });
  }
  const same = ['to', 'sig', 'nudge', 'holds', 'status'].every(k => prev[k] === next[k]);
  return { sends, next: same ? null : next };
}

function decideMsg(m, done, now) {
  const out = [];
  if (!m.tid) return out;
  if (!m.type && m.from === 'admin' && now - ms(m.at) < FRESH && !done.has('m_' + m.id))
    out.push({ key: 'm_' + m.id, tid: m.tid, title: '✉ رسالة من الإدارة', body: String(m.text || '').slice(0, 180), tag: 'msg' });
  if ((m.type === 'req' || m.type === 'absreq') && (m.status === 'approved' || m.status === 'declined') && now - ms(m.decidedAt) < FRESH && !done.has(`q_${m.id}_${m.status}`)) {
    const ab = m.type === 'absreq', ok = m.status === 'approved';
    out.push({ key: `q_${m.id}_${m.status}`, tid: m.tid, title: ok ? (ab ? '✓ اعتُمد طلب تأمين حصصك' : '✓ وافقت الإدارة على طلب التبديل') : (ab ? 'طلب تأمين الحصص ما اعتُمد' : 'طلب التبديل ما اعتُمد'), body: ok ? 'افتح التطبيق للتفاصيل' : (m.adminNote || 'افتح التطبيق للتفاصيل'), tag: m.id });
  }
  return out;
}
// ================= نهاية المنطق المنسوخ =================

// ---------- أدوات ----------
const P = () => PropertiesService.getScriptProperties();
const bh = () => { const d = new Date(), f = s => Utilities.formatDate(d, 'Asia/Bahrain', s); return { iso: f('yyyy-MM-dd'), hm: Number(f('H')) * 60 + Number(f('m')), dow: Number(f('u')) % 7, t: f('HH:mm:ss') }; };
const today = () => bh().iso;
const log = (...a) => console.log(bh().t, ...a);
function hdr() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT }; }

// ترميز/فك قيم Firestore REST
function dec(v) {
  if (!v) return null;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('mapValue' in v) return decF(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
function decF(f) { const o = {}; for (const k in f) o[k] = dec(f[k]); return o; }
function enc(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(enc) } };
  return { mapValue: { fields: encF(x) } };
}
function encF(o) { const f = {}; for (const k in o) if (o[k] !== undefined) f[k] = enc(o[k]); return f; }
const docOf = d => ({ id: d.name.split('/').pop(), ...decF(d.fields || {}) });

// طلبات
function q(coll, field, op, value) {
  return { url: DOCS + ':runQuery', method: 'post', contentType: 'application/json', headers: hdr(), muteHttpExceptions: true,
    payload: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op, value: enc(value) } } } }) };
}
function parseQ(r, what) {
  if (r.getResponseCode() !== 200) throw new Error(what + ' ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText()).filter(x => x.document).map(x => docOf(x.document));
}
function runAll(reqs, names) { return UrlFetchApp.fetchAll(reqs).map((r, i) => parseQ(r, names[i])); }
function batchGet(paths) {
  const out = {}; if (!paths.length) return out;
  for (let i = 0; i < paths.length; i += 100) {
    const r = UrlFetchApp.fetch(DOCS + ':batchGet', { method: 'post', contentType: 'application/json', headers: hdr(), muteHttpExceptions: true, payload: JSON.stringify({ documents: paths.slice(i, i + 100).map(p => ROOT + '/' + p) }) });
    if (r.getResponseCode() !== 200) throw new Error('batchGet ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
    JSON.parse(r.getContentText()).forEach(x => { if (x.found) out[x.found.name.slice(ROOT.length + 1)] = decF(x.found.fields || {}); });
  }
  return out;
}
function listAll(coll, mask) {
  const out = []; let tok = '';
  do {
    const r = UrlFetchApp.fetch(DOCS + '/' + coll + '?pageSize=300' + mask.map(m => '&mask.fieldPaths=' + m).join('') + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''), { headers: hdr(), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('list ' + r.getResponseCode());
    const j = JSON.parse(r.getContentText()); (j.documents || []).forEach(d => out.push(docOf(d))); tok = j.nextPageToken || '';
  } while (tok);
  return out;
}
// كتابة مجمّعة: writes = [{path, data}] (استبدال كامل مثل set) أو [{path, del:'pushTokens.`k`'}] (حذف حقل)
function commit(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const w = writes.slice(i, i + 400).map(x => x.del
      ? { update: { name: ROOT + '/' + x.path, fields: {} }, updateMask: { fieldPaths: [x.del] }, currentDocument: { exists: true } }
      : { update: { name: ROOT + '/' + x.path, fields: encF(x.data) } });
    const r = UrlFetchApp.fetch(DOCS + ':commit', { method: 'post', contentType: 'application/json', headers: hdr(), muteHttpExceptions: true, payload: JSON.stringify({ writes: w }) });
    if (r.getResponseCode() !== 200) log('commit fail', r.getResponseCode(), r.getContentText().slice(0, 300));
  }
}

// ---------- الأجهزة والإرسال ----------
function peopleOf(tid) { return runAll([q('people', 'tid', 'EQUAL', tid)], ['people'])[0]; }
function tokensOf(docs) { const out = []; docs.forEach(p => { if (p.revoked || !p.pushTokens) return; for (const k in p.pushTokens) out.push({ t: p.pushTokens[k], doc: p.id, k }); }); return out; }
function sendAll(items, ctx) { // items = [{n, toks:[{t,doc,k}]}]
  const reqs = [], meta = [];
  items.forEach(({ n, toks }) => {
    if (!toks.length) { log('no device for', n.tid, '|', n.title); return; }
    const seen = {};
    toks.forEach(o => { if (seen[o.t]) return; seen[o.t] = 1;
      reqs.push({ url: `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, method: 'post', contentType: 'application/json', headers: hdr(), muteHttpExceptions: true,
        payload: JSON.stringify({ message: { token: o.t, webpush: { headers: { Urgency: 'high', TTL: '43200' }, data: { title: n.title, body: n.body, tag: n.tag || '', url: './' } } } }) });
      meta.push({ n, o });
    });
  });
  if (!reqs.length) return 0;
  const res = UrlFetchApp.fetchAll(reqs), ok = {}, tot = {};
  res.forEach((r, i) => {
    const { n, o } = meta[i], key = n.tid + '|' + n.title; tot[key] = (tot[key] || 0) + 1;
    if (r.getResponseCode() === 200) { ok[key] = (ok[key] || 0) + 1; return; }
    const body = r.getContentText(); let st = '', code = '';
    try { const e = JSON.parse(body).error; st = e.status; (e.details || []).forEach(d => { if (d.errorCode) code = d.errorCode; }); } catch (e) { }
    const dead = code === 'UNREGISTERED' || st === 'NOT_FOUND' || (code === 'INVALID_ARGUMENT' && /registration token/i.test(body));
    if (dead) { ctx.writes.push({ path: 'people/' + o.doc, del: 'pushTokens.`' + o.k + '`' }); log('رمز ميت انحذف', n.tid, o.k); }
    else log('send fail', n.tid, r.getResponseCode(), code || st, body.slice(0, 160));
  });
  let sent = 0;
  Object.keys(tot).forEach(k => { sent += ok[k] || 0; log('→', k, `(${ok[k] || 0}/${tot[k]})`); });
  return sent;
}

// ---------- الحالة (نسخة سريعة في خصائص السكربت + الأصل في pushlog) ----------
function getStates(ids, props) {
  const st = {}, miss = [];
  ids.forEach(id => { const v = props['A_' + id]; if (v) st[id] = JSON.parse(v).s; else miss.push(id); });
  if (miss.length) { const got = batchGet(miss.map(id => 'pushlog/A_' + id)); miss.forEach(id => { const g = got['pushlog/A_' + id]; if (g) { delete g.at; st[id] = g; } }); }
  return st;
}
function isDone(keys, props) {
  const done = new Set(), miss = keys.filter(k => { if (props['D_' + k]) { done.add(k); return false; } return true; });
  if (miss.length) { const got = batchGet(miss.map(k => 'pushlog/' + k)); miss.forEach(k => { if (got['pushlog/' + k]) { done.add(k); P().setProperty('D_' + k, String(Date.now())); } }); }
  return done;
}

// ================= التشغيلة (كل دقيقة) =================
function tick() {
  const b = bh();
  if (DAYS.indexOf(b.dow) < 0 || b.hm < WIN_FROM || b.hm >= WIN_TO) return; // خارج الدوام
  const lock = LockService.getScriptLock(); if (!lock.tryLock(2000)) return;    // تشغيلة ثانية شغالة
  try { guard(b); } catch (e) { log('err', e.message); } finally { lock.releaseLock(); }
}

function guard(b) {
  const now = Date.now(), T = b.iso, props = P().getProperties();
  const last = Number(props.lastRun || 0), since = Math.max(now - 18 * 3600e3, (last || now - 18 * 3600e3) - OVERLAP);
  const full = !props.lastSweep || now - Number(props.lastSweep) > SWEEP || props.sweepDay !== T;
  const count = !props.lastCount || now - Number(props.lastCount) > COUNT_EVERY;
  const lastTest = Number(props.lastTest || now);
  const ctx = { writes: [] }; let sent = 0;

  // كل القراءات بطلب واحد متوازي
  const reqs = [full ? q('assign', 'date', 'GREATER_THAN_OR_EQUAL', T) : q('assign', 'updatedAt', 'GREATER_THAN_OR_EQUAL', since),
    q('msgs', 'at', 'GREATER_THAN_OR_EQUAL', since), q('msgs', 'decidedAt', 'GREATER_THAN_OR_EQUAL', since),
    q('people', 'pushTest', 'GREATER_THAN', lastTest)];
  const names = ['assign', 'msgs.at', 'msgs.decidedAt', 'people.pushTest'];
  const res = UrlFetchApp.fetchAll(reqs);
  const assigns = parseQ(res[0], names[0]).filter(a => a.date >= T);
  const mAt = parseQ(res[1], names[1]), mDec = parseQ(res[2], names[2]), tests = parseQ(res[3], names[3]);

  // 1) التكليفات
  const st = getStates(assigns.map(a => a.id), props), sends = [], newSt = [];
  assigns.forEach(a => { const r = decideAssign(a, st[a.id] || null, now, T); r.sends.forEach(n => sends.push(n)); if (r.next) newSt.push({ a, next: r.next }); });

  // 2) الرسائل وردود الطلبات
  const seenM = {}, cands = [];
  mAt.concat(mDec).forEach(m => { if (seenM[m.id]) return; seenM[m.id] = 1; decideMsg(m, new Set(), now).forEach(n => cands.push(n)); });
  const done = isDone(cands.map(n => n.key), props), msgSends = cands.filter(n => !done.has(n.key));

  // 3) الإرسال (أجهزة كل معلم تُقرأ وقت الإرسال بس)
  const all = sends.concat(msgSends);
  if (all.length) {
    const tids = [...new Set(all.map(n => n.tid))], tq = runAll(tids.map(t => q('people', 'tid', 'EQUAL', t)), tids.map(() => 'people.tid')), toks = {};
    tids.forEach((t, i) => toks[t] = tokensOf(tq[i]));
    sent += sendAll(all.map(n => ({ n, toks: toks[n.tid] || [] })), ctx);
  }
  // pushTest (لو انضغط زر التجربة في التطبيق)
  let maxTest = lastTest;
  tests.forEach(p => { maxTest = Math.max(maxTest, p.pushTest || 0); if (!p.revoked && p.pushTokens) sent += sendAll([{ n: { tid: p.tid, title: '✓ الإشعارات شغالة', body: 'هذا إشعار تجريبي — بيوصلك كذا أي تكليف أو تبديل', tag: 'test' }, toks: tokensOf([p]) }], ctx); });

  // 4) حفظ الحالة
  const set = {};
  newSt.forEach(({ a, next }) => { ctx.writes.push({ path: 'pushlog/A_' + a.id, data: { ...next, at: now } }); set['A_' + a.id] = JSON.stringify({ d: a.date, s: next }); });
  msgSends.forEach(n => { ctx.writes.push({ path: 'pushlog/' + n.key, data: { tid: n.tid, at: now } }); set['D_' + n.key] = String(now); });

  // 5) النبض للوحة الإدارة
  let dev = Number(props.devices || 0), tch = Number(props.teachers || 0);
  if (count) {
    try {
      const dv = {};
      listAll('people', ['tid', 'pushTokens', 'revoked']).forEach(p => { if (p.revoked || !p.tid || !p.pushTokens) return; for (const k in p.pushTokens) (dv[p.tid] = dv[p.tid] || {})[p.pushTokens[k]] = 1; });
      tch = Object.keys(dv).length; dev = Object.keys(dv).reduce((s, t) => s + Object.keys(dv[t]).length, 0);
      set.devices = String(dev); set.teachers = String(tch); set.lastCount = String(now);
    } catch (e) { log('people count', e.message); }
  }
  ctx.writes.push({ path: 'people/_guard', data: { at: now, devices: dev, teachers: tch, by: 'apps-script' } });
  commit(ctx.writes);

  set.lastRun = String(now); set.lastTest = String(maxTest);
  if (full) { set.lastSweep = String(now); set.sweepDay = T; }
  P().setProperties(set);
  if (full && props.pruneDay !== T) prune(T, props);
  if (sent || all.length) log('أُرسل', sent, '| تكليفات', assigns.length, '| رسائل', cands.length);
}

// تنظيف النسخة السريعة مرة باليوم (الأصل يبقى في pushlog)
function prune(T, props) {
  const old = Date.now() - 2 * 864e5, ps = P();
  Object.keys(props).forEach(k => {
    if (k.startsWith('A_')) { try { if (JSON.parse(props[k]).d < T) ps.deleteProperty(k); } catch (e) { ps.deleteProperty(k); } }
    else if (k.startsWith('D_') && Number(props[k]) < old) ps.deleteProperty(k);
  });
  ps.setProperty('pruneDay', T);
}

// ================= دوال تشغّلها بيدك =================
// 1) فحص الصلاحيات: يقرأ ويكتب ويطبع مين الحساب
function checkAccess() {
  const who = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  log('الحساب:', JSON.parse(who.getContentText()).email);
  const ppl = peopleOf(TEST_TID);
  log('قراءة Firestore ✓ — أجهزة', TEST_TID + ':', tokensOf(ppl).length);
  commit([{ path: 'people/_guard', data: { at: Date.now(), devices: Number(P().getProperty('devices') || 0), teachers: Number(P().getProperty('teachers') || 0), by: 'apps-script' } }]);
  log('كتابة Firestore ✓ (people/_guard)');
}
// 2) إشعار تجريبي على جوال TEST_TID
function testPush() {
  const toks = tokensOf(peopleOf(TEST_TID)), ctx = { writes: [] };
  const n = sendAll([{ n: { tid: TEST_TID, title: '✓ الإشعارات شغالة', body: 'إشعار تجريبي من الحارس الجديد (Apps Script)', tag: 'test' }, toks }], ctx);
  commit(ctx.writes); log('وصل لـ', n, 'من', toks.length, 'جهاز');
}
// 3) تفعيل المؤقت (كل دقيقة)
function setupTrigger() {
  stopTrigger();
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
  log('المؤقت شغال ✓ — كل دقيقة، ويعمل فعليًا 5:30ص–2:30م الأحد–الخميس');
}
function stopTrigger() { ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); }); }
// تشغيل الحارس الحين مرة وحدة حتى لو خارج الدوام (للتجربة)
function runOnceNow() { guard(bh()); log('خلصت التشغيلة'); }
