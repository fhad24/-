(function(){
'use strict';
/* Browser-local Madrasati reports; read-only and no API requests */
const safe = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const civil = v => String(v??'').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/\D/g,'');
const isIso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
function hijriDate(v){
 try{
 const parts=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).formatToParts(new Date(v+'T12:00:00Z'));
 const p=t=>parts.find(x=>x.type===t)?.value||'';
 return p('year')+'/'+p('month')+'/'+p('day')+' هـ';
 }catch{return '—'}
}
function weekday(v){
 try{return new Intl.DateTimeFormat('ar-SA',{weekday:'long',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'))}catch{return '—'}
}
function weekLabel(v){
 const week=typeof weeklyAttWeekNumberForDate==='function'?weeklyAttWeekNumberForDate(v):'';
 if(week==='إجازة الخريف')return week;
 if(v==='2026-09-23')return 'الأسبوع الخامس — اليوم الوطني';
 return week?'الأسبوع '+week:'خارج التقويم الدراسي المرفق';
}
function readLocal(){
 return new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error('هذا المتصفح لا يدعم التخزين المحلي'));return}
  const req=indexedDB.open('hudoor');
  req.onerror=()=>reject(req.error||Error('تعذر فتح بيانات مدرستي'));
  req.onsuccess=()=>{
   const db=req.result;if(!db.objectStoreNames.contains('docs')){db.close();resolve(null);return}
   const result={},tx=db.transaction('docs','readonly'),cursor=tx.objectStore('docs').openCursor();
   cursor.onsuccess=()=>{const c=cursor.result;if(c){if(c.key==='app/roster'||String(c.key).startsWith('days/'))result[c.key]=c.value;c.continue()}};
   tx.oncomplete=()=>{db.close();resolve(result)};
   tx.onerror=()=>{const e=tx.error||Error('تعذرت قراءة سجلات مدرستي');db.close();reject(e)};
  };
 });
}
async function calculate(student){
 const all=await readLocal();if(!all)return {state:'missing',reason:'لا توجد قاعدة تحضير مدرستي في هذا المتصفح.'};
 const roster=Array.isArray(all['app/roster']?.students)?all['app/roster'].students:[];
 const matches=roster.filter(x=>civil(x.i)===civil(student.idno));
 if(!matches.length)return{state:'unmatched',reason:'لم يُطابق السجل المدني لهذا الطالب مع قائمة مدرستي في هذا المتصفح.'};
 const groups=[...new Set(matches.map(x=>String(x.g)+'|'+String(x.c||'').trim()))];
 if(groups.length!==1||!groups[0].split('|')[1])return{state:'unmatched',reason:'الصف أو الفصل للطالب غير واضح في مدرستي؛ لم أحتسب الغياب تجنبًا للخطأ.'};
 const [g,c]=groups[0].split('|'),id=civil(student.idno);
 let dates=null;try{if(typeof weeklyAttReportScopeDates==='function')dates=new Set((weeklyAttReportScopeDates()||[]).map(String))}catch{}
 const count=new Map(),pending=new Set();
 for(const [key,doc] of Object.entries(all)){
  if(!key.startsWith('days/')||!Array.isArray(doc?.sessions))continue;
  const date=String(doc.date||key.slice(5));if(!isIso(date)||dates&&!dates.has(date))continue;
  const own=doc.sessions.filter(s=>String(s.g)===g&&String(s.c||'').trim()===c);
  if(!own.length)continue;
  const verified=own.filter(s=>!s.partial);
  if(!verified.length){pending.add(date);continue}
  const present=verified.some(s=>(s.m||[]).some(x=>civil(x.i)===id));
  const info=count.get(date)||{date,present:false,periods:new Set()};
  info.present=info.present||present;for(const s of verified)if(s.p!=null)info.periods.add(String(s.p));
  count.set(date,info);
 }
 const entries=[...count.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const present=entries.filter(x=>x.present).length,absent=entries.length-present;
 return{state:'ok',rows:entries,present,absent,total:entries.length,rate:entries.length?((absent/entries.length)*100).toFixed(1):'0.0',pendingDates:[...pending].filter(d=>!count.has(d)).sort()};
}
const statCard=(label,value,color)=>'<div style="background:#f7faf8;border:1px solid #dce9e1;border-radius:12px;padding:13px;text-align:center"><div style="font-weight:800;color:#25463b">'+safe(label)+'</div><div style="font-size:27px;font-weight:900;color:'+color+';margin-top:5px">'+safe(value)+'</div></div>';
function render(detail){
 if(detail.state!=='ok')return'<div style="padding:16px;border:1px solid #eadab4;border-radius:12px;background:#fff9ed;color:#74551b">'+safe(detail.reason)+'</div>';
 const stats='<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:14px 0">'+
   statCard('أيام مدرستي المحسوبة',detail.total,'#145849')+statCard('حضور مدرستي',detail.present,'#06754d')+
   statCard('غياب مدرستي',detail.absent,'#b42318')+statCard('نسبة غياب مدرستي',detail.total?detail.rate+'%':'—','#b42318')+'</div>';
 const table=detail.rows.length?'<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr style="background:#e8f2ed"><th>م</th><th>الحالة في مدرستي</th><th>الأسبوع الدراسي</th><th>اليوم</th><th>التاريخ الهجري</th><th>التاريخ الميلادي</th><th>الحصص ذات الكشوف</th></tr></thead><tbody>'+
 detail.rows.map((r,i)=>'<tr style="background:'+(r.present?'#edf8f1':'#fff0ed')+'"><td>'+(i+1)+'</td><td style="font-weight:900;color:'+(r.present?'#08754f':'#b42318')+'">'+(r.present?'حاضر':'غائب')+'</td><td>'+safe(weekLabel(r.date))+'</td><td>'+safe(weekday(r.date))+'</td><td>'+safe(hijriDate(r.date))+'</td><td dir="ltr">'+safe(r.date)+'</td><td>'+safe([...r.periods].sort((a,b)=>Number(a)-Number(b)).join('، ')||'—')+'</td></tr>').join('')+'</tbody></table></div>':
 '<p style="padding:12px;color:#795d2d">لا توجد أيام بكشوف مكتملة لهذا الطالب ضمن فترة التقرير المختارة.</p>';
 return stats+table+(detail.pendingDates?.length?'<div style="background:#fff8e5;border-radius:9px;padding:12px;color:#855b1c;margin-top:10px"><b>كشوف مدرستي التي تحتاج مراجعة: '+detail.pendingDates.length+' يوم</b><p style="margin:5px 0 0">لم تُحسب هذه الأيام غيابًا لعدم اكتمال الكشوف: '+detail.pendingDates.slice(0,16).map(d=>safe(hijriDate(d)+' ('+weekLabel(d)+')')).join('، ')+(detail.pendingDates.length>16?'، وغيرها':'')+'</p></div>':'');
}
async function enhance(modal,student){
 if(!modal||!student)return;
 const container=modal.querySelector('#weeklyAttStudentReportPrintable');
 if(!container||container.querySelector('#shMadrasatiDetail'))return;
 const section=document.createElement('section');section.id='shMadrasatiDetail';
 section.style.cssText='margin-top:24px;padding:15px;border:2px solid #c2dfd1;border-radius:14px;break-inside:avoid';
 section.innerHTML='<h2 style="color:#08614d;margin:0 0 7px;text-align:center">📘 حضور وغياب منصة مدرستي — تقرير مستقل</h2><p style="color:#536f61;text-align:center;margin:0 0 12px">بيانات مدرستي منفصلة عن غياب المدرسة أعلاه ولا تُضاف إلى مجموعه. لا تُحسب الأيام دون كشف مكتمل.</p><div id="shMadrasatiDetailBody" style="text-align:center;padding:12px">جارٍ قراءة بيانات مدرستي من هذا المتصفح…</div>';
 container.appendChild(section);
 const print=modal.querySelector('#weeklyAttStudentReportPrint');if(print)print.disabled=true;
 try{
  const info=await calculate(student);if(!section.isConnected)return;
  section.querySelector('#shMadrasatiDetailBody').innerHTML=render(info);
  for(const cell of section.querySelectorAll('td,th')){cell.style.border='1px solid #b5c5be';cell.style.padding='8px 5px'}
  section.querySelector('#shMadrasatiDetailBody').style.padding='0';
 }catch(e){if(section.isConnected)section.querySelector('#shMadrasatiDetailBody').textContent='تعذّر قراءة بيانات مدرستي: '+(e?.message||e)}
 finally{if(print&&print.isConnected)print.disabled=false}
}
window.shEnhanceMadrasatiStudentReport=enhance;
})();