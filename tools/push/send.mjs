// مُرسل الإشعارات: يشتغل من GitHub Actions كل 5 دقائق وقت الدوام.
// يرسل لكل معلم إشعارًا واحدًا عن: تكليف تأمين/مراقبة/تبديل جديد له، رسالة من الإدارة، رد الإدارة على طلبه.
// ما يتكرر: كل إشعار ينسجّل في pushlog (ما يقراها التطبيق).
import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.SA)), projectId: 'ap-taameen' });
const db = admin.firestore(), fcm = admin.messaging();
const NOW = Date.now(), FRESH = 12 * 3600e3; // ما نرسل عن شي أقدم من 12 ساعة
const bh = new Date(NOW + 3 * 3600e3), TODAY = bh.toISOString().slice(0, 10);

// أجهزة المعلمين (من الرموز الفعّالة فقط)
const tokens = {}, owner = {};
for (const d of (await db.collection('people').get()).docs) {
  const p = d.data(); if (p.revoked || !p.tid || !p.pushTokens) continue;
  for (const [k, t] of Object.entries(p.pushTokens)) { (tokens[p.tid] = tokens[p.tid] || new Set()).add(t); owner[t] = { doc: d.id, k }; }
}
const out = []; // { key, tid, title, body, tag }
const ms = v => typeof v === 'number' ? v : v && v.toMillis ? v.toMillis() : 0;

for (const d of (await db.collection('assign').where('date', '>=', TODAY).get()).docs) {
  const a = d.data(); if (a.status !== 'pending' || !a.to) continue;
  if (NOW - ms(a.updatedAt || a.createdAt) > FRESH) continue;
  const when = a.date === TODAY ? 'اليوم' : (a.day || a.date);
  const title = a.kind === 'duty' ? '☕ مراقبة فسحة' : a.kind === 'swap' ? '⇄ تبديل حصة' : '🛡️ تكليف تأمين';
  const body = a.kind === 'swap'
    ? `${when}: تدخل الحصة ${a.slotName}${a.c ? ' (' + a.c + ')' : ''} — افتح التطبيق للتفاصيل والاستلام`
    : `${when}: ${a.kind === 'duty' ? (a.slotName || 'الفسحة') : 'الحصة ' + a.slotName}${a.c ? ' (' + a.c + ')' : ''}${a.time ? ' ' + a.time : ''} — افتح التطبيق واضغط «استلمت التكليف»`;
  out.push({ key: `a_${d.id}_${a.to}`, tid: a.to, title, body, tag: d.id });
}
for (const d of (await db.collection('msgs').get()).docs) {
  const m = d.data(); if (!m.tid) continue;
  if (!m.type && m.from === 'admin' && NOW - ms(m.at) < FRESH)
    out.push({ key: `m_${d.id}`, tid: m.tid, title: '✉ رسالة من الإدارة', body: String(m.text || '').slice(0, 180), tag: 'msg' });
  if ((m.type === 'req' || m.type === 'absreq') && (m.status === 'approved' || m.status === 'declined') && NOW - ms(m.decidedAt) < FRESH) {
    const ab = m.type === 'absreq', ok = m.status === 'approved';
    out.push({ key: `q_${d.id}_${m.status}`, tid: m.tid, title: ok ? (ab ? '✓ اعتُمد طلب تأمين حصصك' : '✓ وافقت الإدارة على طلب التبديل') : (ab ? 'طلب تأمين الحصص ما اعتُمد' : 'طلب التبديل ما اعتُمد'), body: ok ? 'افتح التطبيق للتفاصيل' : (m.adminNote || 'افتح التطبيق للتفاصيل'), tag: d.id });
  }
}

let sent = 0, skipped = 0, dead = 0;
for (const n of out) {
  const ts = [...(tokens[n.tid] || [])]; if (!ts.length) { skipped++; continue; }
  const log = db.collection('pushlog').doc(n.key.replace(/\//g, '_'));
  if ((await log.get()).exists) continue;
  const r = await fcm.sendEachForMulticast({ tokens: ts, webpush: { headers: { Urgency: 'high', TTL: '43200' }, data: { title: n.title, body: n.body, tag: n.tag, url: './' } } });
  r.responses.forEach((x, i) => {
    if (x.success) return;
    const c = x.error && x.error.code;
    if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') {
      const o = owner[ts[i]]; dead++; db.collection('people').doc(o.doc).update({ ['pushTokens.' + o.k]: admin.firestore.FieldValue.delete() }).catch(() => { });
    } else console.log('fail', n.key, c);
  });
  if (r.successCount) { sent++; await log.set({ tid: n.tid, at: NOW, ok: r.successCount }); }
}
console.log(`devices: ${Object.values(tokens).reduce((s, x) => s + x.size, 0)} | candidates: ${out.length} | sent: ${sent} | no-device: ${skipped} | dead tokens: ${dead}`);
