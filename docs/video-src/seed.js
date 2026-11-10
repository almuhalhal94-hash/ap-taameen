// بيانات تجريبية وهمية للتصوير — لا تُكتب في السحابة
(function(){
  if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded','1');
  const pad=n=>String(n).padStart(2,'0'); const d=new Date(); const T=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const day=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][d.getDay()];
  const now=Date.now();
  const A={};
  const base={date:T,day,status:'pending',refused:[],released:[],log:[],names:{},backups:[],updatedAt:now,first:''};
  A[T+'_cover_t1_4']={...base,kind:'cover',absent:'t1',absentName:'أ. يعقوب علي',out:false,slot:'4',slotName:'الرابعة',time:'10:10–10:55',c:'2ع1',label:'',to:'t3',toName:'أ. طلال سعود',first:'t3',sups:['t26']};
  const d2=new Date(Date.now()+86400000);const T2=`${d2.getFullYear()}-${pad(d2.getMonth()+1)}-${pad(d2.getDate())}`;
  A[T2+'_duty_t2_B1']={...base,date:T2,day:'الأربعاء',kind:'duty',absent:'t5',absentName:'أ. حسين أحمد سلمان',out:false,slot:'B1',slotName:'الفسحة الأولى',time:'8:55–9:25',c:'',label:'مراقبة — المقصف والصفوف الخشبية',to:'t3',toName:'أ. طلال سعود',first:'t3',sups:[]};
  // للمشرف
  A[T+'_cover_t1_5']={...base,kind:'cover',absent:'t1',absentName:'أ. يعقوب علي',slot:'5',slotName:'الخامسة',time:'10:55–11:40',c:'3ع1',label:'',to:'t4',toName:'أ. عمر محمد إرشاد',status:'accepted',sups:['t26']};
  A[T+'_cover_t1_6']={...base,kind:'cover',absent:'t1',absentName:'أ. يعقوب علي',slot:'6',slotName:'السادسة',time:'11:40–12:25',c:'1ع1',label:'',to:'t6',toName:'أ. ياسر عبد الله القشار',auto:true,sups:['t26']};
  A[T+'_cover_t1_2']={...base,kind:'cover',absent:'t1',absentName:'أ. يعقوب علي',slot:'2',slotName:'الثانية',time:'8:10–8:55',c:'4ع1',label:'',to:'t7',toName:'أ. ماجد القحطاني',status:'accepted',sups:['t26']};
  A[T2+'_cover_t28_2']={...base,date:T2,day:'الأربعاء',kind:'cover',absent:'t28',absentName:'أ. محمد سعيد القحطاني',slot:'2',slotName:'الثانية',time:'8:10–8:55',c:'3ع3',label:'',to:'t26',toName:'أ. وليد جاد',first:'t26',sups:[]};
  const people={'246810':{tid:'t3',name:'أ. طلال سعود',role:'teacher'},'135790':{tid:'t26',name:'أ. وليد جاد',role:'both',sup:true,supLabel:'1ع1 · 2ع1 · 3ع1 · 4ع1'}};
  localStorage.setItem('apt-sync-demo',JSON.stringify({people,assign:A,msgs:{},explain:{}}));
})();
