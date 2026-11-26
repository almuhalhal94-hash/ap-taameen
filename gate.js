// رمز دخول صفحة الإداري (يمنع الفضوليين — الحماية الكاملة بتسجيل الدخول مرحلة ثانية)
(function () {
  var H = 'cba5dbafc8936c37f26e2138c3d600b69e43e80e2295436c5f7dc72d3a4b399e', K = 'apt-admin-ok';
  try { if (localStorage.getItem(K) === H) return; } catch (e) { }
  if (window.claude && window.claude.use) return; // داخل Claude: البرنامج خاص بصاحبه
  var css = 'position:fixed;inset:0;z-index:9999;background:#2b0408;display:grid;place-items:center;font-family:Readex,system-ui,sans-serif;direction:rtl';
  var d = document.createElement('div'); d.setAttribute('style', css);
  d.innerHTML = '<form style="background:#fbf7ef;color:#2a1a14;padding:28px 24px;border-radius:20px;width:min(340px,90vw);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)">'
    + '<h2 style="margin:0 0 6px;color:#7a0a16">مكتب المدير المساعد</h2><p style="margin:0 0 16px;color:#6f6158;font-size:.9rem">أدخل رمز الدخول</p>'
    + '<input id="gPin" inputmode="numeric" autocomplete="off" style="width:100%;font-size:1.4rem;text-align:center;letter-spacing:6px;padding:10px;border:1px solid #e6dccb;border-radius:12px" maxlength="12">'
    + '<button style="margin-top:14px;width:100%;padding:11px;border:0;border-radius:12px;background:#7a0a16;color:#fff;font-weight:700;font-size:1rem">دخول</button>'
    + '<p id="gErr" style="color:#b4232c;min-height:1.2em;margin:10px 0 0;font-size:.85rem"></p></form>';
  var go = function () {
    document.body.appendChild(d); var i = d.querySelector('#gPin'); i.focus();
    d.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      crypto.subtle.digest('SHA-256', new TextEncoder().encode('apt:' + i.value.trim())).then(function (b) {
        var h = Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
        if (h === H) { try { localStorage.setItem(K, H); } catch (e) { } d.remove(); }
        else { d.querySelector('#gErr').textContent = 'الرمز غير صحيح'; i.value = ''; }
      });
    };
  };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
