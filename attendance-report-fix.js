/* Correct all-weeks/monthly attendance counts from Excel truth */
(function(){
function mode(){const w=document.getElementById('weeklyAttWeek');const v=String(w?.value||'');const t=String(w?.selectedOptions?.[0]?.textContent||'');return v==='all'||t.includes('كل الأسابيع')?'all':v==='monthly'||t.includes('شهري')?'monthly':'weekly'}
function monthKey(d){try{const p=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'2-digit'}).formatToParts(new Date(d+'T12:00:00'));return (p.find(x=>x.type==='year')?.value||'')+'-'+(p.find(x=>x.type==='month')?.value||'')}catch(e){return''}}
function selectedMonth(){return String(document.getElementById('weeklyAttHijriMonthSelect')?.value||'')}
function stats(id,m,mk){
 const E=window.__EXCEL_ATTENDANCE_TRUTH_20261010;if(!E)return null;const x=E.map.get(String(id));const by=new Map();
 if(x)E.dates.forEach((d,i)=>{if(m==='monthly'&&mk&&monthKey(d)!==mk)return;const b=1<<i;by.set(d,(x[0]&b)?'p':(x[1]&b)?'a':'')});
 let rows=[];try{rows=typeof getAttendanceLog==='function'?(getAttendanceLog()||[]):[]}catch(e){}
 for(const r of rows){if(String(r?.idno||'')!==String(id))continue;const d=String(r?.date||'');if(E.dates.includes(d))continue;if(m==='monthly'&&mk&&monthKey(d)!==mk)continue;const prev=by.get(d);if(r.status==='present'||r.status==='late')by.set(d,'p');else if(r.status==='absent'&&prev!=='p')by.set(d,'a')}
 let p=0,a=0;by.forEach(v=>{if(v==='p')p++;else if(v==='a')a++});return{p,a,c:p+a,r:p+a?Math.round(p/(p+a)*100):0}
}
function run(){
 const m=mode();if(m==='weekly')return;const table=document.querySelector('#weeklyAttSheet table');if(!table)return;
 const hs=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').replace(/\s+/g,' ').trim());
 const ci=hs.findIndex(x=>x.includes('السجل المدني')),pi=hs.findIndex(x=>/^حاضر/.test(x)),ai=hs.findIndex(x=>/^غائب/.test(x)),co=hs.findIndex(x=>x.includes('أيام محسوبة')),ri=hs.findIndex(x=>x.includes('نسبة الحضور')),gi=hs.findIndex(x=>x.includes('غياب الشهر')||x.includes('الغياب حتى الآن'));
 if(ci<0||pi<0||ai<0)return;const mk=m==='monthly'?selectedMonth():'';let sp=0,sa=0,n=0;
 table.querySelectorAll('tbody tr').forEach(tr=>{const td=[...tr.children];if(!td[ci])return;const id=String(td[ci].textContent||'').replace(/\D/g,'');if(!id)return;const s=stats(id,m,mk);if(!s)return;
 const set=(i,v)=>{if(i>=0&&td[i]){const q=td[i].querySelector('b')||td[i];if(q.textContent!==String(v))q.textContent=String(v)}};set(pi,s.p);set(ai,s.a);set(co,s.c);set(ri,s.r+'%');set(gi,s.a);sp+=s.p;sa+=s.a;n++});
 if(n){const p=document.getElementById('weeklyAttPresentCount'),a=document.getElementById('weeklyAttAbsentCount');if(p)p.textContent=String(sp);if(a)a.textContent=String(sa)}
}
const later=()=>setTimeout(run,60);document.addEventListener('change',later,true);document.addEventListener('click',later,true);new MutationObserver(later).observe(document.documentElement,{childList:true,subtree:true});setTimeout(run,500);setTimeout(run,1500);
})();