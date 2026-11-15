// الحارس: يراقب السحابة لحظيًا طول الدوام ويرسل إشعار لكل معلم يخصه تغيير (خلال ثواني).
// يشتغل من GitHub Actions (push-guard.yml على main) من 5:30 الصبح لين 9 الليل بتوقيت البحرين.
import admin from 'firebase-admin';
import { decideAssign, decideMsg } from './logic.mjs';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.SA)), projectId: 'ap-taameen' });
const db = admin.firestore(), fcm = admin.messaging(), FV = admin.firestore.FieldValue;
const START = Date.now(), MAX_MS = (Number(process.env.MAX_MIN || 345)) * 60e3;
const bhNow = () => new Date(Date.now() + 3 * 3600e3);
const today = () => bhNow().toISOString().slice(0, 10);
const log = (...a) => console.log(bhNow().toISOString().slice(11, 19), ...a);

// الحالة المحفوظة (عشان ما يتكرر شي بعد إعادة التشغيل)
const state = new Map(), done = new Set();
for (const d of (await db.collection('pushlog').get()).docs) { if (d.id.startsWith('A_')) state.set(d.id.slice(2), d.data()); else done.add(d.id); }
log('pushlog loaded:', state.size, 'assign states,', done.size, 'messages');

// طابور واحد عشان الترتيب وعدم التكرار
let q = Promise.resolve();
const run = fn => (q = q.then(fn).catch(e => log('err', e.message)));
// أجهزة المعلمين لحظيًا (من الرموز الفعّالة فقط)
let devices = {}, owner = {}, firstPeople = true;
const testSeen = new Map();
db.collection('people').onSnapshot(s => {
  // زر «إرسال إشعار تجريبي» في تطبيق المعلم
  s.docs.forEach(d => { const p = d.data(), t = p.pushTest || 0; if (!firstPeople && t > (testSeen.get(d.id) || 0) && !p.revoked && p.pushTokens) run(() => pushTo(Object.values(p.pushTokens), { tid: p.tid, title: '✓ الإشعارات شغالة', body: 'هذا إشعار تجريبي — بيوصلك كذا أي تكليف أو تبديل', tag: 'test' })); if (p.pushErr && (p.pushErrAt || 0) > START - 864e5 && !testSeen.has('e' + d.id)) { testSeen.set('e' + d.id, 1); log('pushErr', p.tid, p.pushErr, '|', (p.ua || '').slice(0, 90)); } testSeen.set(d.id, t); });
  firstPeople = false;
  const dv = {}, ow = {};
  s.docs.forEach(d => { const p = d.data(); if (p.revoked || !p.tid || !p.pushTokens) return; for (const [k, t] of Object.entries(p.pushTokens)) { (dv[p.tid] = dv[p.tid] || new Set()).add(t); ow[t] = { doc: d.id, k }; } });
  const nd = Object.values(dv).reduce((n, x) => n + x.size, 0), was = Object.values(devices).reduce((n, x) => n + x.size, 0);
  devices = dv; owner = ow;
  if (nd !== was) log('devices:', nd, 'teachers:', Object.keys(dv).length);
}, e => { log('people listener error', e.code); process.exit(1); });

let sentCount = 0;
async function push(n) { return pushTo([...(devices[n.tid] || [])], n); }
async function pushTo(ts, n) {
  if (!ts.length) { log('no device for', n.tid, '|', n.title); return; }
  const r = await fcm.sendEachForMulticast({ tokens: ts, webpush: { headers: { Urgency: 'high', TTL: '43200' }, data: { title: n.title, body: n.body, tag: n.tag || '', url: './' } } });
  r.responses.forEach((x, i) => {
    if (x.success) return;
    const c = x.error && x.error.code, o = owner[ts[i]];
    if ((c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') && o) db.collection('people').doc(o.doc).update({ ['pushTokens.' + o.k]: FV.delete() }).catch(() => { });
    else log('send fail', n.tid, c);
  });
  sentCount += r.successCount; log('→', n.tid, n.title, `(${r.successCount}/${ts.length})`);
}

const listen = () => db.collection('assign').where('date', '>=', today()).onSnapshot(s => {
  const ch = s.docChanges().filter(c => c.type !== 'removed');
  run(async () => {
    for (const c of ch) {
      const a = { id: c.doc.id, ...c.doc.data() };
      const { sends, next } = decideAssign(a, state.get(a.id) || null, Date.now(), today());
      for (const n of sends) await push(n);
      if (next) { state.set(a.id, next); await db.collection('pushlog').doc('A_' + a.id).set({ ...next, at: Date.now() }); }
    }
  });
}, e => { log('assign listener error', e.code); process.exit(1); });
listen();

db.collection('msgs').onSnapshot(s => {
  const ch = s.docChanges().filter(c => c.type !== 'removed');
  run(async () => {
    for (const c of ch) for (const n of decideMsg({ id: c.doc.id, ...c.doc.data() }, done, Date.now())) {
      done.add(n.key); await push(n); await db.collection('pushlog').doc(n.key).set({ tid: n.tid, at: Date.now() });
    }
  });
}, e => { log('msgs listener error', e.code); process.exit(1); });

log('الحارس شغال — يراقب التكليفات والرسائل');
const beat = () => db.collection('people').doc('_guard').set({ at: Date.now(), devices: Object.values(devices).reduce((n, x) => n + x.size, 0), teachers: Object.keys(devices).length }).catch(e => log('beat', e.code));
beat(); setInterval(beat, 60e3);
// يشتغل على مدار الساعة: قبل حد GitHub (6 ساعات) يشغّل التشغيلة اللي بعده بنفسه ثم ينهي — بدون فجوة
let handing = false;
async function handOff() {
  if (handing) return; handing = true;
  try {
    const r = await fetch(`https://api.github.com/repos/${process.env.REPO}/actions/workflows/push-guard.yml/dispatches`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: 'main' }) });
    log('handoff → next run', r.status);
  } catch (e) { log('handoff failed', e.message); }
  log('انتهت التشغيلة — أُرسل', sentCount); q.then(() => process.exit(0));
}
setInterval(() => { if (Date.now() - START > MAX_MS) handOff(); }, 30e3);
