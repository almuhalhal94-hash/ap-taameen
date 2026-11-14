// فحص صلاحيات المفتاح: قراءة السحابة + إرسال إشعار تجريبي (dryRun = ما يوصل لأحد)
import admin from 'firebase-admin';
const sa = JSON.parse(process.env.SA || '{}');
console.log('SA email:', sa.client_email || '(none)');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'ap-taameen' });
try { const s = await admin.firestore().collection('msgs').limit(1).get(); console.log('FIRESTORE_READ: OK', s.size); }
catch (e) { console.log('FIRESTORE_READ: FAIL', e.code, e.message.slice(0, 200)); }
try { await admin.messaging().send({ token: 'test-token-not-real', notification: { title: 't', body: 't' } }, true); console.log('FCM: OK'); }
catch (e) { console.log('FCM:', e.code, '|', e.message.slice(0, 200)); }
