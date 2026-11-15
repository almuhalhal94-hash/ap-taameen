// طبقة المزامنة بين جوالات المعلمين والمشرفين والإداري
// - لو firebase-config.js فيه إعدادات: Firebase Firestore (مباشر بين كل الأجهزة)
// - لو فاضي: «وضع تجربة» يحفظ في هذا المتصفح ويتزامن بين تبويباته فقط
(function () {
  'use strict';
  const cfg = window.FIREBASE_CONFIG;
  const V = '10.12.2', BASE = `https://www.gstatic.com/firebasejs/${V}/`;

  function firebaseApi() {
    return Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-firestore.js')]).then(([A, F]) => {
      const app = A.initializeApp(cfg);
      const fs = F.getFirestore(app);
      const ref = p => F.doc(fs, p);
      const q = (c, wh) => wh ? F.query(F.collection(fs, c), F.where(wh[0], wh[1], wh[2])) : F.collection(fs, c);
      return {
        mode: 'firebase',
        async get(p) { const s = await F.getDoc(ref(p)); return s.exists() ? s.data() : null; },
        set(p, d) { return F.setDoc(ref(p), d, { merge: true }); },
        put(p, d) { return F.setDoc(ref(p), d); },
        add(c, d) { return F.addDoc(F.collection(fs, c), d).then(r => r.id); },
        // تعديل ذرّي: fn تستلم المستند الحالي وترجع الجديد (أو null بدون تغيير)
        tx(p, fn) {
          return F.runTransaction(fs, async t => {
            const r = ref(p), s = await t.get(r);
            const v = fn(s.exists() ? s.data() : null);
            if (v) t.set(r, v);
            return v;
          });
        },
        watch(c, wh, cb) {
          return F.onSnapshot(q(c, wh), s => cb(s.docs.map(x => ({ id: x.id, ...x.data() }))), e => console.warn('sync', e));
        }
      };
    });
  }

  function demoApi() {
    const KEY = 'apt-sync-demo';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    let all = load();
    const subs = new Set();
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel('apt-sync') : null;
    const fire = () => subs.forEach(s => s());
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { } if (bc) bc.postMessage(1); setTimeout(fire, 0); };
    const reload = () => { all = load(); fire(); };
    if (bc) bc.onmessage = reload;
    window.addEventListener('storage', e => { if (e.key === KEY) reload(); });
    const split = p => { const i = p.indexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
    const match = (d, wh) => {
      if (!wh) return true;
      const v = d[wh[0]];
      return wh[1] === 'array-contains' ? Array.isArray(v) && v.includes(wh[2]) : v === wh[2];
    };
    const clone = x => x == null ? null : JSON.parse(JSON.stringify(x));
    return Promise.resolve({
      mode: 'demo',
      async get(p) { const [c, id] = split(p); return clone((all[c] || {})[id]); },
      async set(p, d) { const [c, id] = split(p); all[c] = all[c] || {}; all[c][id] = { ...(all[c][id] || {}), ...clone(d) }; save(); },
      async put(p, d) { const [c, id] = split(p); all[c] = all[c] || {}; all[c][id] = clone(d); save(); },
      async add(c, d) { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); all[c] = all[c] || {}; all[c][id] = clone(d); save(); return id; },
      async tx(p, fn) { all = load(); const [c, id] = split(p); const v = fn(clone((all[c] || {})[id])); if (v) { all[c] = all[c] || {}; all[c][id] = clone(v); save(); } return v; },
      watch(c, wh, cb) {
        let last = '';
        const run = () => {
          const list = Object.entries(all[c] || {}).filter(([, d]) => match(d, wh)).map(([id, d]) => ({ id, ...clone(d) }));
          const sig = JSON.stringify(list);
          if (sig !== last) { last = sig; cb(list); }
        };
        subs.add(run); run();
        return () => subs.delete(run);
      }
    });
  }

  // على الموقع الحي ما ندخل «وضع التجربة» بصمت لو النت ضعيف: نعيد المحاولة ونبيّن للمستخدم
  const live = cfg && cfg.apiKey;
  const tryFb = n => firebaseApi().catch(e => {
    console.warn('تعذّر الاتصال بـ Firebase', e);
    if (n >= 6) { alert('تعذّر الاتصال بالخادم — تأكد من الإنترنت ثم افتح التطبيق من جديد'); throw e; }
    let el = document.getElementById('netWarn');
    if (!el) { el = Object.assign(document.createElement('div'), { id: 'netWarn' }); el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;background:#9b1c1c;color:#fff;text-align:center;padding:8px;font:600 14px system-ui'; document.body.appendChild(el); }
    el.textContent = 'جاري الاتصال… تأكد من الإنترنت';
    return new Promise(r => setTimeout(r, 2500 * n)).then(() => tryFb(n + 1));
  }).then(api => { const el = document.getElementById('netWarn'); if (el) el.remove(); return api; });
  const ready = live ? tryFb(1) : demoApi();
  window.Sync = { ready };
})();
