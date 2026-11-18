// منطق قرار الإشعار (بدون اتصال) — يُختبر محليًا ويستخدمه الحارس
export const FRESH = 12 * 3600e3;
const ms = v => typeof v === 'number' ? v : v && v.toMillis ? v.toMillis() : 0;
const where = a => `${a.kind === 'duty' ? (a.slotName || 'الفسحة') : 'الحصة ' + a.slotName}${a.c ? ' (' + a.c + ')' : ''}${a.time ? ' ' + a.time : ''}`;
const whenOf = (a, today) => a.date === today ? 'اليوم' : (a.day || a.date);
const titleOf = a => a.kind === 'duty' ? '☕ مراقبة فسحة' : a.kind === 'swap' ? '⇄ تبديل حصة' : '🛡️ تكليف تأمين';

// prev = آخر حالة أُبلغ عنها لهذا التكليف {to, sig, nudge, active}
// يرجّع { sends:[{tid,title,body,tag}], next } — next = الحالة الجديدة للحفظ (أو null = لا تغيير)
export function decideAssign(a, prev, now, today) {
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

export function decideMsg(m, done, now) {
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
