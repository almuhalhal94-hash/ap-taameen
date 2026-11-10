import numpy as np, subprocess, json
SR=48000; T=65.0; N=int(T*SR)
OV=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'sfx')+'/'
APP=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','..','app','snd')+'/'
def load(f):
    raw=subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','2','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw,np.float32).reshape(-1,2).copy()
S={'wh':load(OV+'whoosh/swipe-whoosh-b7ae78.mp3'),'whd':load(OV+'whoosh/deep-whoosh-1-eab8a6.mp3'),'wha':load(OV+'whoosh/swosh-swoosh-whoosh-air-sound-free-high--f1dc60.mp3'),
   'sp':load(OV+'sparkle/sparkling-star-01-wav-e464d1.mp3'),'sp2':load(OV+'sparkle/sparkling-star-04-wav-a56694.mp3'),
   'tap':load(APP+'tap.mp3'),'tap2':load(APP+'tap2.mp3'),'tap3':load(APP+'tap3.mp3'),'ok':load(APP+'accept.mp3'),'nt':load(APP+'notify.mp3'),
   'send':load(APP+'send.mp3'),'sw':load(APP+'swipe.mp3'),'sw2':load(APP+'swipe2.mp3'),'sw3':load(APP+'swipe3.mp3'),'rj':load(APP+'reject.mp3')}
def norm(x,peak_db):
    p=np.abs(x).max()+1e-9; return x*(10**(peak_db/20)/p)
PEAK={'wh':-15,'whd':-14,'wha':-17,'sp':-17,'sp2':-18,'tap':-15,'tap2':-15,'tap3':-20,'ok':-13,'nt':-13,'send':-15,'sw':-16,'sw2':-16,'sw3':-16,'rj':-17}
for k in S: S[k]=norm(S[k],PEAK[k])
sfx=np.zeros((N,2),np.float32)
def put(k,t,g=0,anchor='start',dur=None):
    x=S[k]
    if dur: x=x[:int(dur*SR)].copy(); f=int(.05*SR); x[-f:]*=np.linspace(1,0,f)[:,None]
    off=0
    if anchor=='peak': env=np.abs(x).max(1); off=int(np.argmax(env))
    i=int(t*SR)-off
    if i<0: x=x[-i:]; i=0
    n=min(len(x),N-i); sfx[i:i+n]+=x[:n]*10**(g/20)
# انتقالات
for t in [5.6,6.45,23.55,37.05,55.1]: put('wh',t,anchor='peak')
for t in [14.6,18.2,48.42]: put('whd',t,-1,anchor='peak',dur=1.4)
put('wha',57.9,-4,anchor='peak')
# الشعار والختام
put('sp',2.15,-1); put('sp2',55.85,-3)
# نقرات الأصابع
for t in [8.55,11.22,12.62,13.5,15.62,16.72,17.3,23.3,30.55,32.52,33.88,34.28,36.38,38.5,40.7,44.1,45.85,49.5,51.9]: put('tap',t)
for i in range(6): put('tap2',19.5+i*.25,-2)            # الأرقام
for i in range(6): put('tap3',44.7+i*.13,-1)            # كتابة السبب
put('tap3',7.45,-2)                                     # التقاط الباركود
# سحب ونجاح
put('sw',29.1); put('sw2',30.62); put('sw3',34.32,-1); put('sw',36.45,-3)
for t in [14.0,17.62,23.4,30.65]: put('ok',t)
put('send',45.92); put('nt',46.5)
# الصوت
vo=load('vo_user.wav'); vo=vo*10**((-16-(-26.7))/20)       # ~ -16 LUFS
mix=np.zeros((N,2),np.float32); i=int(2.5*SR); mix[i:i+len(vo)]+=vo[:N-i]
# خفض المؤثرات تحت الكلام (4 dB) بغلاف ناعم
env=np.zeros(N); a=np.abs(mix).max(1); w=int(.05*SR)
lv=np.convolve(a,np.ones(w)/w,'same'); act=(lv>0.01).astype(float)
k=int(.15*SR); act=np.convolve(act,np.ones(k)/k,'same')
duck=10**(-4*np.clip(act,0,1)/20)
sfx*=duck[:,None]
out=mix+sfx
open('sfx.f32','wb').write(sfx.astype(np.float32).tobytes()); open('mix.f32','wb').write(out.astype(np.float32).tobytes())
for name in ['sfx','mix']:
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','2','-i',name+'.f32','-c:a','pcm_s24le',name+'_raw.wav'])
print('peak',20*np.log10(np.abs(out).max()))
