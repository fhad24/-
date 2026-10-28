(()=>{'use strict';
const id='madrasati-extra', root='#weeklyAttSheet', heads=['حضور مدرستي','غياب مدرستي','نسبة غياب مدرستي'];
let byId=new Map(),busy=false,queued=false,loaded=false,sortColumn=-1,sortDirection=1;
const hijri=v=>{try{const [y,m,d]=String(v).slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d)))}catch{return String(v||'')}};
function getAll(){return new Promise((resolve,reject)=>{const request=indexedDB.open('hudoor',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('docs'))request.result.createObjectStore('docs')};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,all={},req=db.transaction('docs','readonly').objectStore('docs').openCursor();req.onsuccess=()=>{const c=req.result;if(c){all[c.key]=c.value;c.continue()}else{db.close();resolve(all)}};req.onerror=()=>{db.close();reject(req.error)}}})}
async function read(){try{const docs=await getAll();const students=new Map((docs['app/roster']?.students||[]).map(x=>[String(x.i||''),x]));const days=Object.entries(docs).filter(([k,v])=>k.startsWith('days/')&&Array.isArray(v?.sessions)).map(([k,v])=>({date:v.date||k.slice(5),sessions:v.sessions}));const totals=new Map();for(const [sid,student] of students){let present=0,absent=0;for(const day of days){const ss=day.sessions.filter(s=>!s.partial&&String(s.g)===String(student.g)&&String(s.c)===String(student.c));if(!ss.length)continue;if(ss.some(s=>(s.m||[]).some(m=>String(m.i||'')===sid)))present++;else absent++}totals.set(sid,{present,absent})}byId=totals;loaded=true;render()}catch(e){console.warn('Madrasati report load:',e);loaded=false;render()}}
function render(){if(busy)return;busy=true;try{const table=document.querySelector(root+' table.weekly-att-table');if(!table)return;const head=table.querySelector('thead tr'),body=table.querySelector('tbody');if(!head||!body)return;
if(!head.querySelector('th[data-madrasati]'))for(const [column,title] of heads.entries()){const th=document.createElement('th');th.dataset.madrasati='1';th.textContent=title;th.style.cssText='background:#e7f4ed;color:#095a46;min-width:115px;cursor:pointer';th.title='اضغط للترتيب التصاعدي أو التنازلي';th.addEventListener('click',()=>{if(sortColumn===column)sortDirection*=-1;else{sortColumn=column;sortDirection=1}render()});head.append(th)}
const ths=[...head.querySelectorAll('th')],idIndex=ths.findIndex(x=>x.textContent.includes('السجل المدني'));if(idIndex<0)return;
for(const row of body.querySelectorAll('tr')){const cells=[...row.children];if(!cells[idIndex]||cells[idIndex].colSpan>1)continue;const sid=String(cells[idIndex].textContent||'').replace(/\D/g,'');if(!sid)continue;let extras=[...row.querySelectorAll('td[data-madrasati]')];while(extras.length<3){const td=document.createElement('td');td.dataset.madrasati='1';td.style.cssText='text-align:center;font-weight:bold';row.append(td);extras.push(td)}const x=byId.get(sid),values=x?[x.present,x.absent,x.present+x.absent?((x.absent*100)/(x.present+x.absent)).toFixed(1)+'%':'—']:['—','—','—'];extras.forEach((td,i)=>{if(td.textContent!==String(values[i]))td.textContent=String(values[i])})}
if(sortColumn>=0){const numeric=tr=>{const cell=tr.querySelectorAll('td[data-madrasati]')[sortColumn];const v=cell?.textContent?.trim();return !v||v==='—'?null:Number(v.replace('%','').replace(/,/g,''))};const original=[...body.rows];const sortable=original.filter(tr=>tr.querySelectorAll('td[data-madrasati]').length===3);sortable.sort((a,b)=>{const av=numeric(a),bv=numeric(b);if(av===null)return bv===null?0:1;if(bv===null)return -1;return (av-bv)*sortDirection});sortable.forEach(tr=>body.appendChild(tr));head.querySelectorAll('th[data-madrasati]').forEach((th,i)=>{th.textContent=heads[i]+(i===sortColumn?(sortDirection===1?' ▲':' ▼'):' ↕')})}
let note=document.getElementById('shMadrasatiNotice');if(!note){note=document.createElement('div');note.id='shMadrasatiNotice';note.style.cssText='padding:8px;margin:7px 0;border-radius:9px;background:#ecf6f0;color:#175b47;font-size:13px';table.parentNode.insertBefore(note,table)}note.textContent='بيانات مدرستي مستقلة عن سجلات المدرسة، وتحسب الأيام التي لها كشوف مكتملة فقط. تُقرأ من بيانات هذا المتصفح دون تعديل السجلات.'}finally{busy=false}}

/* Never-attended report inside the MAIN school attendance screen.
 * Uses only the Madrasati IndexedDB; no school attendance rows are mutated.
 * An actually prepared class-day requires a complete, ID-matched session.
 */
const neverSafe=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const neverDigits=x=>String(x??'').replace(/[٠-٩]/g,ch=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch))).replace(/[۰-۹]/g,ch=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch))).replace(/\D/g,'');
const neverGrade=x=>{const t=String(x??'').replace(/\s+/g,'').replace(/[إأآ]/g,'ا').replace(/[٠-٩]/g,ch=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
 if(/^(1|اول|الاول)/.test(t))return '1';if(/^(2|ثاني|الثاني)/.test(t))return '2';if(/^(3|ثالث|الثالث)/.test(t))return '3';return''};
const neverClass=x=>{let s=String(x??'').trim().replace(/^(?:الفصل|فصل)\s*/,'').replace(/\s+/g,'').replace(/[إأآ]/g,'ا').replace(/هــ|هـ/g,'ه');try{if(typeof studentClassKey==='function')s=String(studentClassKey(s)||s).replace(/هــ|هـ/g,'ه')}catch{}return s};
const neverGradeLabel={'1':'الأول الثانوي','2':'الثاني الثانوي','3':'الثالث الثانوي'};
function computeNeverAttendedMadrasati(docs,schoolRoster){
 const sourceRoster=Array.isArray(docs?.['app/roster']?.students)?docs['app/roster'].students:[];
 const sourceById=new Map(),sourceConflict=new Set();
 for(const r of sourceRoster){
  const id=neverDigits(r.i);if(!id||/^0+$/.test(id))continue;
  const key=neverGrade(r.g)+'|'+neverClass(r.c);
  if(!neverGrade(r.g)||!neverClass(r.c))continue;
  if(sourceById.has(id)&&sourceById.get(id).key!==key)sourceConflict.add(id);
  else sourceById.set(id,{key});
 }
 const cohortDays=new Map(),seenAttendance=new Set(),allDays=new Set();
 let partialDays=0,unmatchedDays=0,completeDays=0;
 const records=Object.entries(docs||{}).filter(([k,v])=>k.startsWith('days/')&&Array.isArray(v?.sessions));
 const now=new Date().toISOString().slice(0,10);
 for(const [path,record]of records){
  const date=String(record.date||path.slice(5));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>now)continue;
  if(typeof WEEKLY_WEEK5_VACATION_DATES!=='undefined'&&WEEKLY_WEEK5_VACATION_DATES.has(date))continue;
  const cohorts=new Map();
  for(const s of record.sessions){
   const grade=neverGrade(s.g),cls=neverClass(s.c);
   if(!grade||!cls)continue;
   const key=grade+'|'+cls;
   if(!cohorts.has(key))cohorts.set(key,[]);
   cohorts.get(key).push(s);
   // Any attendance, even in a partial capture or a different class,
   // disproves an assertion that a student NEVER attended.
   for(const m of (s.m||[])){const id=neverDigits(m?.i);if(id&&!/^0+$/.test(id))seenAttendance.add(id)}
  }
  for(const [key,list]of cohorts){
   if(list.some(s=>s.partial===true||!Array.isArray(s.m))){partialDays++;continue}
   if(list.some(s=>s.m.some(m=>!neverDigits(m?.i)||/^0+$/.test(neverDigits(m?.i))))){unmatchedDays++;continue}
   const dates=cohortDays.get(key)||new Set();dates.add(date);cohortDays.set(key,dates);
   allDays.add(date);completeDays++;
  }
 }
 const never=[],seen=new Set();let notLinked=0,conflicts=0,withoutPrepared=0;
 for(const student of schoolRoster||[]){
  const id=neverDigits(student.idno),grade=neverGrade(student.grade),cls=neverClass(student.classroom);
  if(!id||seen.has(id)||!grade||!cls||/وهمي|انتساب/.test(cls))continue;
  seen.add(id);
  const src=sourceById.get(id);
  if(!src){notLinked++;continue}
  if(sourceConflict.has(id)||src.key!==grade+'|'+cls){conflicts++;continue}
  if(seenAttendance.has(id))continue;
  const dates=cohortDays.get(src.key);
  if(!dates?.size){withoutPrepared++;continue}
  never.push({id,name:String(student.name||''),phone:String(student.phone||''),grade,classroom:String(student.classroom||''),days:dates.size});
 }
 never.sort((a,b)=>Number(a.grade)-Number(b.grade)||a.classroom.localeCompare(b.classroom,'ar')||a.name.localeCompare(b.name,'ar'));
 return {never,summary:{days:allDays.size,completeDays,partialDays,unmatchedDays,notLinked,conflicts,withoutPrepared,students:schoolRoster.length,sourceStudents:sourceRoster.length}};
}
function neverSchoolRoster(){
 try{return typeof getStudents==='function'?(getStudents()||[]):[]}catch(e){console.warn('student roster for Madrasati never attended',e);return []}
}
let neverState=null,neverDialog=null;
function neverReportRows(){
 const grade=neverDialog?.querySelector('#shNeverGrade')?.value||'all';
 const all=neverState?.never||[];
 return grade==='all'?all:all.filter(x=>x.grade===grade);
}
function neverReportDocument(grade,rows,summary){
 const label=grade==='all'?'جميع الصفوف':neverGradeLabel[grade];
 const chunks=[];for(let i=0;i<rows.length;i+=20)chunks.push(rows.slice(i,i+20));
 if(!chunks.length)chunks.push([]);
 const table=rows0=>'<table><thead><tr><th>م</th><th>اسم الطالب</th><th>السجل المدني</th><th>الصف</th><th>الفصل</th><th>الجوال</th><th>عدد الأيام</th><th>ملاحظات</th></tr></thead><tbody>'+
 rows0.map((r,i)=>'<tr><td>'+(rows.indexOf(r)+1)+'</td><td style="text-align:right">'+neverSafe(r.name)+'</td><td>'+neverSafe(r.id)+'</td><td>'+neverSafe(neverGradeLabel[r.grade])+'</td><td>'+neverSafe(r.classroom)+'</td><td>'+neverSafe(r.phone||'—')+'</td><td>'+r.days+'</td><td class="red">الطالب لم يحضر نهائيا</td></tr>').join('')+
 (rows0.length?'':'<tr><td colspan="8">لا يوجد طلاب مطابقون لهذا الصف</td></tr>')+'</tbody></table>';
 const pages=chunks.map((part,i)=>'<section class="nvpage"><header><h2>مدرسة شرحبيل بن حسنة الثانوية</h2><h1>كشف الطلاب الذين لم يحضروا منصة مدرستي نهائيًا ولا حصة</h1><div>الصف: '+neverSafe(label)+' | إجمالي الطلاب: '+rows.length+' | الأيام المحضّرة فعليًا بالمدرسة: '+summary.days+'</div></header>'+table(part)+'<footer>من كشوف منصة مدرستي المكتملة المسجلة في هذا المتصفح — الصفحة '+(i+1)+' من '+chunks.length+'</footer></section>').join('');
 const style='<style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{margin:0;direction:rtl;background:white;color:#173529;font-family:Tahoma,Arial,sans-serif}.nvpage{width:100%;padding:13px 16px;page-break-after:always;break-after:page;min-height:640px}.nvpage:last-child{page-break-after:auto;break-after:auto}header{text-align:center;border-bottom:2px solid #146d5d;padding-bottom:7px;margin-bottom:12px}h1{font-size:18px;margin:3px 0;color:#095949}h2{font-size:14px;margin:1px}header div{font-size:12px;margin-top:5px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}th,td{border:1px solid #b8cfc5;padding:7px 5px;text-align:center;overflow-wrap:anywhere}th{background:#0d6657;color:white}td:nth-child(2){width:24%;font-weight:bold}th:nth-child(2){width:24%}th:last-child{width:19%}tr:nth-child(even) td{background:#f4f9f6}td.red{color:#b42318!important;font-weight:900}footer{font-size:10px;text-align:center;color:#60776a;margin-top:12px}@media print{.nvpage{padding:0;min-height:0}thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}}</style>';
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف عدم حضور مدرستي — '+neverSafe(label)+'</title>'+style+'</head><body>'+pages+'</body></html>';
}
function neverDownloadBlob(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function neverExport(format){
 if(!neverState)return;
 const grade=neverDialog.querySelector('#shNeverGrade').value,rows=neverReportRows();
 const label=grade==='all'?'جميع_الصفوف':neverGradeLabel[grade].replace(/\s+/g,'_');
 const name='كشف_لم_يحضروا_مدرستي_نهائيا_'+label;
 const markup=neverReportDocument(grade,rows,neverState.summary);
 if(format==='print'){const w=window.open('','_blank','width=1200,height=900');if(!w){alert('اسمح بفتح النوافذ للطباعة.');return}w.document.open();w.document.write(markup);w.document.close();w.focus();setTimeout(()=>w.print(),350);return}
 if(format==='word'){neverDownloadBlob(new Blob(['\ufeff',markup],{type:'application/msword;charset=utf-8'}),name+'.doc');return}
 if(format==='xlsx'){
  if(!window.XLSX){alert('أداة Excel لم تُحمّل بعد.');return}
  const aoa=[['كشف الطلاب الذين لم يحضروا منصة مدرستي نهائيًا ولا حصة'],['الصف',grade==='all'?'جميع الصفوف':neverGradeLabel[grade]],[],['م','اسم الطالب','السجل المدني','الصف','الفصل','الجوال','عدد الأيام','ملاحظات']];
  rows.forEach((r,i)=>aoa.push([i+1,r.name,String(r.id),neverGradeLabel[r.grade],r.classroom,String(r.phone||''),r.days,'الطالب لم يحضر نهائيا']));
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:6},{wch:48},{wch:18},{wch:18},{wch:10},{wch:19},{wch:14},{wch:32}];
  ws['!views']=[{RTL:true}];for(let i=4;i<aoa.length;i++){for(const k of ['C','F']){const cell=ws[k+(i+1)];if(cell){cell.t='s';cell.z='@'}}}
  XLSX.utils.book_append_sheet(wb,ws,'لم يحضر مدرستي');
  neverDownloadBlob(new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');
  return;
 }
 if(format==='pdf'){
  if(!window.html2pdf){alert('تصدير PDF غير متاح الآن. استخدم الطباعة ثم اختر «حفظ كملف PDF».');return}
  const stage=document.createElement('div');stage.style.cssText='position:fixed;left:-20000px;top:0;width:1123px;z-index:-1;background:white';
  const content=document.createElement('div');content.innerHTML=markup.slice(markup.indexOf('<body>')+6,markup.indexOf('</body>'));
  const css=document.createElement('style');css.textContent=markup.slice(markup.indexOf('<style>')+7,markup.indexOf('</style>')).replace(/@page\{[^}]*\}/g,'');
  stage.append(css,content);document.body.append(stage);
  try{await html2pdf().set({margin:7,filename:name+'.pdf',html2canvas:{scale:1.5,useCORS:true,backgroundColor:'#fff'},image:{type:'jpeg',quality:.95},jsPDF:{unit:'mm',format:'a4',orientation:'landscape'},pagebreak:{mode:['css','legacy'],after:'.nvpage'}}).from(content).save()}
  finally{stage.remove()}
 }
}
function neverRender(){
 if(!neverDialog||!neverState)return;
 const grade=neverDialog.querySelector('#shNeverGrade').value,rows=neverReportRows();
 const s=neverState.summary;
 neverDialog.querySelector('#shNeverCount').textContent='العدد: '+rows.length+' طالبًا | ترقيم تسلسلي من ١ إلى '+rows.length;
 neverDialog.querySelector('#shNeverStats').textContent='أيام تحضير مكتملة: '+s.days+' | فصول/أيام مكتملة: '+s.completeDays+' | أيام بها كشف جزئي مستبعدة: '+s.partialDays+' | أيام بها أسماء غير مطابقة مستبعدة: '+s.unmatchedDays+' | طلاب غير مرتبطين ببيانات مدرستي: '+s.notLinked;
 const body=neverDialog.querySelector('#shNeverBody');
 body.innerHTML=rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+neverSafe(r.name)+'</td><td dir="ltr">'+neverSafe(r.id)+'</td><td>'+neverSafe(neverGradeLabel[r.grade])+'</td><td>'+neverSafe(r.classroom)+'</td><td dir="ltr">'+neverSafe(r.phone||'—')+'</td><td>'+r.days+'</td><td style="color:#b42318;font-weight:900">الطالب لم يحضر نهائيا</td></tr>').join('')||'<tr><td colspan="8">لا يوجد طلاب مطابقون لهذا الصف ضمن الأيام المحضرة فعليًا.</td></tr>';
}
async function openNeverMadrasatiReport(){
 if(neverDialog){neverDialog.remove();neverDialog=null}
 const backdrop=document.createElement('div');neverDialog=backdrop;backdrop.id='shNeverMadrasatiDialog';
 backdrop.style.cssText='position:fixed;inset:0;z-index:1000000;background:#0008;padding:18px;display:flex;justify-content:center;align-items:flex-start;overflow:auto;direction:rtl';
 backdrop.innerHTML='<section style="background:white;color:#143c32;max-width:1250px;width:100%;border-radius:18px;padding:20px;font-family:Tahoma,Arial,sans-serif;box-shadow:0 18px 70px #0003"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="margin:0;color:#0f6b56">الطلاب الذين لم يحضروا نهائيًا ولا حصة — منصة مدرستي</h2><button type="button" id="shNeverClose" class="btn btn-outline">إغلاق ✕</button></div><p id="shNeverLoad" style="font-weight:bold">جارٍ قراءة أيام التحضير الفعلية من هذا المتصفح…</p><div id="shNeverReportContent" hidden><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"><label>الصف <select id="shNeverGrade" style="padding:9px;border-radius:10px"><option value="all">جميع الصفوف</option><option value="1">الأول الثانوي</option><option value="2">الثاني الثانوي</option><option value="3">الثالث الثانوي</option></select></label><b id="shNeverCount"></b><button type="button" class="btn btn-primary" data-nv-export="pdf">حفظ PDF</button><button type="button" class="btn btn-primary" data-nv-export="xlsx">Excel</button><button type="button" class="btn btn-outline" data-nv-export="word">Word</button><button type="button" class="btn btn-outline" data-nv-export="print">طباعة</button></div><p id="shNeverStats" style="background:#edf6f1;padding:9px;border-radius:10px;line-height:1.7;font-size:12px"></p><div style="overflow:auto;max-height:60vh"><table style="border-collapse:collapse;width:100%;font-size:12px;min-width:1050px;text-align:center"><thead><tr style="background:#0b6757;color:#fff"><th>م</th><th>اسم الطالب</th><th>السجل المدني</th><th>الصف</th><th>الفصل</th><th>الجوال</th><th>عدد الأيام</th><th>ملاحظات</th></tr></thead><tbody id="shNeverBody"></tbody></table></div><p style="font-size:12px;color:#6b4d18">يُحتسب فقط اليوم الذي له كشف مدرستي مكتمل دون أسماء مجهولة. هذا تقرير من سجلات الحضور وليس إثباتًا لعدم تسجيل الدخول تقنيًا إلى المنصة.</p></div></section>';
 document.body.append(backdrop);
 backdrop.addEventListener('click',async e=>{
  if(e.target===backdrop||e.target.closest('#shNeverClose')){backdrop.remove();if(neverDialog===backdrop)neverDialog=null;return}
  const btn=e.target.closest('[data-nv-export]');if(!btn)return;
  btn.disabled=true;try{await neverExport(btn.dataset.nvExport)}catch(err){alert('تعذّر إنشاء الكشف: '+String(err?.message||err))}finally{btn.disabled=false}
 });
 backdrop.querySelector('#shNeverGrade').addEventListener('change',neverRender);
 try{
  const docs=await getAll(),roster=neverSchoolRoster();
  if(!backdrop.isConnected)return;
  const result=computeNeverAttendedMadrasati(docs,roster);
  if(!roster.length){backdrop.querySelector('#shNeverLoad').textContent='لم تُحمّل بيانات الطلاب من التطبيق الرئيسي. افتح كشف متابعة الطلاب أولًا.';return}
  if(!result.summary.sourceStudents){backdrop.querySelector('#shNeverLoad').textContent='لا توجد بيانات طلاب منصة مدرستي في هذا المتصفح. افتح تحضير مدرستي واستورد نسخة بيانات التحضير JSON ثم أعد المحاولة.';return}
  if(!result.summary.completeDays){backdrop.querySelector('#shNeverLoad').textContent='لم أجد أي يوم تحضير مكتمل موثوق في بيانات مدرستي. الكشوف الجزئية أو غير المطابقة لا تكفي للحكم بأن الطالب لم يحضر.';return}
  neverState=result;
  backdrop.querySelector('#shNeverLoad').textContent='كشف من الأيام التي تم تحضيرها فعليًا فقط. راجع الأسماء قبل الاعتماد.';
  backdrop.querySelector('#shNeverReportContent').hidden=false;
  neverRender();
 }catch(error){if(backdrop.isConnected)backdrop.querySelector('#shNeverLoad').textContent='تعذّر قراءة بيانات مدرستي: '+String(error?.message||error)}
}
function ensureNeverReportButton(){
 const anchor=document.getElementById('weeklyAttMainCardsBtn')||document.getElementById('weeklyAttStudentReportBtn');
 if(!anchor||document.getElementById('shNeverMadrasatiBtn'))return;
 const button=document.createElement('button');
 button.type='button';button.id='shNeverMadrasatiBtn';
 button.className=anchor.className||'btn btn-primary';
 button.textContent='🚫 الطلاب الذين لم يحضروا نهائيًا ولا حصة';
 button.style.cssText='background:#0f7665;color:#fff;border-color:#0f7665;font-weight:900';
 button.addEventListener('click',openNeverMadrasatiReport);
 anchor.insertAdjacentElement('afterend',button);
}

function schedule(){ensureNeverReportButton();if(queued)return;queued=true;setTimeout(()=>{queued=false;render()},130)}
function start(){ensureNeverReportButton();const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});read();setInterval(read,60000);document.addEventListener('click',e=>{if(e.target.closest('#weeklyAttShowBtn,#weeklyAttSheet'))schedule()},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();