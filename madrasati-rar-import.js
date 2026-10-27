(function(){
'use strict';
const EXT_IMAGE=/\.(png|jpe?g|webp)$/i,EXT_CHAT=/\.txt$/i,EXT_IMAGE_DOC=/\.(png|jpe?g|webp|pdf)$/i;
const base=n=>String(n||'').replace(/\\/g,'/').split('/').pop().toLowerCase();
const cleanDigits=s=>String(s||'').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
const safe=t=>esc(String(t??''));
let current=null,activeJob=false,aborted=false;
function gregDate(y,m,d){
 const stamp=[y,('0'+m).slice(-2),('0'+d).slice(-2)].join('-');
 const check=new Date(stamp+'T12:00:00Z');
 return y>=2019&&y<=2040&&check.getUTCFullYear()===y&&check.getUTCMonth()+1===m&&check.getUTCDate()===d?stamp:null;
}
function archiveDate(name){
 const s=cleanDigits(name).replace(/\\/g,'/');
 let m=s.match(/(?:^|[^\d])(20\d{2})[-_.\/]?([01]\d)[-_.\/]?([0-3]\d)(?!\d)/);
 if(m){const d=gregDate(+m[1],+m[2],+m[3]);if(d)return d}
 m=s.match(/(?:^|[^\d])([0-3]?\d)[-_.\/]([01]?\d)[-_.\/](20\d{2})(?!\d)/);
 if(m){const d=gregDate(+m[3],+m[2],+m[1]);if(d)return d}
 return '';
}
function folderHead(path){const words=String(path||'').replace(/[_\\\/\-]+/g,' ').replace(/\.[^.]+$/,' ').replace(/\d{8,}/g,' ');return cpHead(words)}
function mime(path){return /\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg'}
const ui=()=>document.getElementById('modal');
function status(v){const node=document.getElementById('shRarStatus');if(node)node.textContent=v}
function showError(e){
 const m=ui();m.hidden=false;
 const reason=String(e?.message||e);
 const tip=/memory|out of bounds|alloc|maximum|quota|abort/i.test(reason)
  ?'هذا الأرشيف كبير جدًا لذا قد لا تكفي ذاكرة المتصفح لفكّه. إذا تكرر الخطأ فقسّمه إلى ملفات أصغر أو استخرج منه الأيام المطلوبة إلى ZIP.'
  :'تأكد أن ملف RAR غير مشفر وغير تالف. الملفات المقسمة إلى أجزاء تحتاج جمع أجزائها.';
 m.innerHTML='<div class="card stack" style="max-width:650px"><h2>تعذّر فتح ملف RAR</h2><div class="notice">'+safe(reason)+'</div><p class="muted">'+safe(tip)+'</p><button class="btn primary" id="shRarErrorClose">إغلاق</button></div>';
 m.onclick=e=>{if(e.target.closest('#shRarErrorClose')){m.hidden=true;m.onclick=null}};
}
async function openArchive(file){
 const {createExtractorFromData}=await import('https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/+esm');
 if(typeof createExtractorFromData!=='function')throw Error('لم تُحمّل مكتبة فتح RAR بطريقة صحيحة.');
 const response=await fetch('https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/esm/js/unrar.wasm');
 if(!response.ok)throw Error('تعذّر تنزيل أداة فك RAR، تحقق من اتصال الإنترنت.');
 const wasmBinary=await response.arrayBuffer(),data=await file.arrayBuffer();
 const extractor=await createExtractorFromData({data,wasmBinary});
 const headers=[...extractor.getFileList().fileHeaders].filter(h=>!h.flags?.directory);
 if(!headers.length)throw Error('الأرشيف خالٍ من الملفات أو لا يمكن قراءة فهرسه.');
 if(headers.some(h=>h.flags?.encrypted))throw Error('الأرشيف يحتوي على ملفات مشفرة بكلمة مرور. افتحه بكلمة المرور ثم أعد تصديره دون تشفير.');
 return {extractor,headers};
}
function extractOnly(extractor,names){
 const files=[...new Set(names)].filter(Boolean);
 if(!files.length)return [];
 const archive=extractor.extract({files});
 const found=[];
 for(const item of archive.files){
  const name=String(item.fileHeader?.name||'');
  if(item.extraction&&item.extraction.length)found.push({name,data:item.extraction});
 }
 return found;
}
function mergeMeta(path,fromChat){
 const current=folderHead(path);const chat=fromChat?.head||{};
 return {g:chat.g||current.g,c:chat.c||current.c,p:chat.p||current.p};
}
function textAttendance(text,date){
 const parsed=parseChat(filterChat(text,date).text,{teachers:new Set()});
 const results=[];
 for(const ss of parsed.sessions){
  if(!ss.g||!ss.c||!ss.p)continue;
  const seen=new Map();
  for(const student of ss.m){
   const match=matchName(student.n,ss.g,ss.c);
   const r=match?.i&&S.byId.get(match.i);
   if(r&&+r.g===+ss.g&&String(r.c)===String(ss.c))seen.set(String(r.i),{i:String(r.i),n:r.n});
  }
  if(!seen.size)continue;
  results.push({date,type:'text',session:{g:ss.g,c:ss.c,p:ss.p,s:'',t:'',m:[...seen.values()],note:'كشف مستخرج من محادثة واتساب داخل RAR — راجع الأسماء'}})
 }
 return results;
}
async function analyze(file,archive,chosen,unknownDate,unknownPeriod,rows){
 const m=ui();m.hidden=false;aborted=false;activeJob=true;
 m.innerHTML='<div class="card stack" style="max-width:650px"><h2>قراءة الأيام المختارة من RAR</h2><p class="muted">فك الصور وفحصها على جهازك دون رفعها إلى الخادم. لن يُحفظ أي كشف حتى تراجعه وتوافق عليه.</p><div id="shRarStatus" class="muted">جارٍ التحضير…</div><button class="btn" id="shRarStop">إلغاء القراءة</button></div>';
 m.onclick=e=>{if(e.target.closest('#shRarStop')){aborted=true;status('سيتم إيقاف القراءة بعد إكمال الدفعة الحالية…')}};
 const selected=new Set(chosen),all=rows.filter(x=>selected.has(x.date)||(x.date===''&&unknownDate));
 if(!all.length){activeJob=false;status('لا توجد مرفقات للمدة المختارة.');return}
 const images=all.filter(x=>EXT_IMAGE.test(x.name));
 const chats=all.filter(x=>EXT_CHAT.test(x.name));
 const dayItems=[],issues=[],messages=[],imageItems=[];
 try{
  status('قراءة رسائل واتساب وبيانات الملفات النصية…');
  let textFile=archive.chatText;
  if(!textFile&&chats.length){
   for(const file of extractOnly(archive.extractor,chats.map(x=>x.name).slice(0,5))){
    if(file.data.length>12*1024*1024){issues.push('ملف نصي كبير تخطى الحد الآمن: '+file.name);continue}
    textFile+='\n'+new TextDecoder('utf-8',{fatal:false}).decode(file.data);
   }
  }
  if(textFile){
   messages.push(...cpMessages(textFile));
   for(const date of selected){try{dayItems.push(...textAttendance(textFile,date))}catch(e){issues.push('تعذّرت قراءة قوائم '+hijri(date)+': '+e.message)}}
  }
  const msgMap=new Map();
  messages.forEach((msg,idx)=>{for(const f of msg.files||[]){const key=base(f);const arr=msgMap.get(key)||[];arr.push({msg,idx});msgMap.set(key,arr)}});
  const configured=images.map(row=>{
   const candidates=msgMap.get(base(row.name))||[];
   const found=candidates.length===1?candidates[0]:null;
   const date=found?.msg?.date||row.date||unknownDate;
   let h=mergeMeta(row.name,found&&{head:found.msg.head});
   if(found){const i=found.idx;
    for(const off of [1,-1,2,-2]){
      const near=messages[i+off];if(!near||near.date!==date||near.who&&found.msg.who&&near.who!==found.msg.who)continue;
      const delta=Math.abs((near.min||0)-(found.msg.min||0));if(delta>40)continue;
      if(!h.g&&near.head?.g){h.g=near.head.g;h.c=near.head.c}
      if(!h.p&&near.head?.p)h.p=near.head.p;
    }
   }
   if(!h.p&&unknownPeriod&&!row.date)h.p=+unknownPeriod;
   return {...row,date,head:h};
  }).filter(row=>selected.has(row.date)||row.date===unknownDate);
  const batchSize=8;
  // Extraction is selective. Keep only a small batch of image bytes in memory.
  async function* readBatches(){
   for(let i=0;i<configured.length;i+=batchSize){
    if(aborted)break;
    const batch=configured.slice(i,i+batchSize),wanted=new Map(batch.map(r=>[r.name,r]));
    status('فك الصور '+(i+1)+'–'+Math.min(configured.length,i+batchSize)+' من '+configured.length);
    const files=extractOnly(archive.extractor,batch.map(x=>x.name));
    const extracted=new Set();
    for(const entry of files){
     const info=wanted.get(entry.name);if(!info)continue;extracted.add(entry.name);
     yield {date:info.date,ref:entry.name,path:entry.name,blob:new Blob([entry.data],{type:mime(entry.name)}),head:info.head};
    }
    for(const row of batch)if(!extracted.has(row.name))issues.push('تعذّر فك الصورة: '+row.name);
    await new Promise(ok=>setTimeout(ok,0));
   }
  }
  if(!configured.length&&!dayItems.length)issues.push('لم أجد صورًا بتاريخ محدد أو أسماء نصية قابلة للمطابقة. راجع اختيار التاريخ أو مجلدات الصور.');
  const prepared={zip:null,messages,dayItems,imageItems:readBatches(),imageTotal:configured.length,issues};
  activeJob=false;
  await window.shMadrasatiOfflineImport(file,[...selected],prepared);
 }catch(e){activeJob=false;showError(e)}
}
function renderArchiveList(file,archive,rows,chatText){
 const m=ui();m.hidden=false;
 const dates=new Map(),unassigned=rows.filter(x=>!x.date),chatDatesMap=chatText?chatDates(chatText):new Map();
 for(const row of rows){if(!row.date)continue;const x=dates.get(row.date)||{count:0,images:0};x.count++;if(EXT_IMAGE.test(row.name))x.images++;dates.set(row.date,x)}
 for(const [d,x]of chatDatesMap)if(!dates.has(d))dates.set(d,{count:0,images:0});
 const arr=[...dates].sort((a,b)=>b[0].localeCompare(a[0])),bytes=(file.size/(1024*1024)).toFixed(0);
 const statusMessage='تم العثور على '+rows.length+' ملف داخل RAR ('+bytes+' م.ب). اختر التاريخ أو عدة تواريخ لقراءة صورها. الملفات التي لا تحمل تاريخًا تحتاج تاريخًا تحدده أنت.';
 m.innerHTML='<div class="card stack" style="width:min(780px,96vw);max-height:94dvh;overflow:hidden;display:flex;flex-direction:column"><div class="row" style="justify-content:space-between"><h2 style="margin:0">📂 استيراد من RAR</h2><button class="btn" id="shRarClose">✕ إغلاق</button></div><p class="muted">'+safe(statusMessage)+'</p><div style="min-height:0;max-height:45vh;overflow:auto" class="daylist">'+arr.map(([d,o])=>'<label class="dayitem"><input type="checkbox" data-rar-day="'+safe(d)+'" '+(o.images?'':'')+'> <b>'+safe(hijri(d))+'</b> <small>('+safe(d)+') — '+o.images+' صورة، '+o.count+' ملف</small></label>').join('')+'</div>'+(unassigned.length?'<div class="notice"><b>'+unassigned.length+' ملفًا بلا تاريخ موثوق.</b> لن تُربط بيوم تلقائيًا. <label>تاريخها: <input type="date" id="shRarUnknownDay"></label> <label>الحصة (إن كانت جميع هذه الصور لحصة واحدة): <select id="shRarUnknownPeriod"><option value="">غير محددة</option>'+Object.entries(PN).map(([p,t])=>'<option value="'+p+'">'+safe(t)+'</option>').join('')+'</select></label></div>':'')+'<div class="row" style="flex-shrink:0;border-top:1px solid #ddd;padding:10px 0"><button class="btn" id="shRarAll">تحديد الكل</button><button class="btn" id="shRarNone">إلغاء التحديد</button><button class="btn primary" id="shRarAnalyze">قراءة الأيام المختارة ومراجعتها</button></div></div>';
 m.onclick=async e=>{
  if(e.target.closest('#shRarClose')){m.hidden=true;m.onclick=null;current=null;return}
  if(e.target.closest('#shRarAll')){m.querySelectorAll('[data-rar-day]').forEach(x=>x.checked=true);return}
  if(e.target.closest('#shRarNone')){m.querySelectorAll('[data-rar-day]').forEach(x=>x.checked=false);return}
  if(e.target.closest('#shRarAnalyze')){
   const chosen=[...m.querySelectorAll('[data-rar-day]:checked')].map(x=>x.dataset.rarDay);
   const unknown=m.querySelector('#shRarUnknownDay')?.value||'';
   const period=m.querySelector('#shRarUnknownPeriod')?.value||'';
   if(!chosen.length&&!unknown){toast('اختر تاريخًا أو حدّد تاريخ الملفات غير المصنفة');return}
   if(unknown)chosen.push(unknown);
   const button=e.target;button.disabled=true;
   await analyze(file,archive,chosen,unknown,period,rows);
  }
 };
}
async function start(file){
 if(activeJob)return;
 const m=ui();m.hidden=false;
 m.innerHTML='<div class="card stack" style="max-width:600px"><h2>فتح أرشيف RAR</h2><p class="muted">جارٍ قراءة فهرس الأرشيف محليًا… حجم الملف الكبير قد يحتاج ذاكرة مرتفعة.</p><div id="shRarStatus"></div><button class="btn" id="shRarAbortBeforeRead">إغلاق</button></div>';
 m.onclick=e=>{if(e.target.closest('#shRarAbortBeforeRead')){m.hidden=true}};
 try{
  status('تحميل مكتبة RAR وإعداد الذاكرة…');
  const archive=await openArchive(file);
  const rows=archive.headers.map(h=>({name:h.name,date:archiveDate(h.name)}));
  const txt=rows.filter(x=>EXT_CHAT.test(x.name)).slice(0,4);
  let chatText='';
  if(txt.length){
   status('استخراج نصوص المحادثة لتحديد تواريخ المرفقات…');
   for(const ent of extractOnly(archive.extractor,txt.map(x=>x.name)))if(ent.data.length<12*1024*1024)chatText+='\n'+new TextDecoder('utf-8',{fatal:false}).decode(ent.data);
  }
  archive.chatText=chatText;
  if(chatText){
   const map=new Map();
   cpMessages(chatText).forEach(m=>{for(const name of m.files||[]){const key=base(name);const list=map.get(key)||[];list.push(m.date);map.set(key,list)}});
   for(const r of rows){const refs=map.get(base(r.name))||[];if(refs.length===1&&refs[0])r.date=refs[0]}
  }
  current={file,archive,rows};
  renderArchiveList(file,archive,rows,chatText);
 }catch(e){showError(e)}
}
window.shMadrasatiRarImport=start;
})();