(function(){
'use strict';
let cancelled=false;
const fileName=x=>String(x||'').split('/').pop().toLowerCase();
const fmt=x=>String(x||'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[ً-ْـ]/g,'').replace(/[^ء-ي\s]/g,' ').replace(/\s+/g,' ').trim();
function words(x){return fmt(x).split(/\s+/).filter(w=>w.length>1&&!['بن','ابن','بنت'].includes(w))}
/* OCR names must be corroborated against the school roster, never guessed from one fuzzy word. */
function ocrToken(w){return String(w||'').replace(/[أإآ]/g,'ا').replace(/[ؤ]/g,'و').replace(/[ئ]/g,'ي').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/^ال(?=.{3,})/,'')}
function ocrTokens(x){return words(x).map(ocrToken).filter(Boolean)}
function ocrLev(a,b){
 if(a===b)return 0;const n=b.length;if(Math.abs(a.length-n)>2)return 9;
 let prev=Array.from({length:n+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=n;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next}
 return prev[n];
}
function ocrWordScore(a,b){if(a===b)return 1;if(a.length<4||b.length<4)return 0;const d=ocrLev(a,b);return d===1?0.79:d===2&&Math.min(a.length,b.length)>=7?0.58:0}
function ocrNameScore(tokens,person){
 const name=ocrTokens(person.n);
 if(name.length<3||tokens.length<3)return 0;
 const same=(s,a)=>s>=.75&&a>=.75;
 let best=0;
 for(let i=0;i<tokens.length;i++){
  const first=ocrWordScore(tokens[i],name[0]);if(first<.75)continue;
  const stop=Math.min(tokens.length,i+name.length+3);
  for(let k=i+2;k<stop;k++){
   const last=ocrWordScore(tokens[k],name[name.length-1]);if(last<.75)continue;
   let hit=2,exact=(first===1?1:0)+(last===1?1:0),pos=i+1;
   for(const expected of name.slice(1,-1)){
    let v=0,at=-1;
    for(let j=pos;j<k;j++){const s=ocrWordScore(tokens[j],expected);if(s>v){v=s;at=j}}
    if(v>=.75){hit++;exact+=v===1?1:0;pos=at+1}
   }
   if(hit<Math.max(3,Math.ceil(name.length*.72)))continue;
   const missing=Math.max(0,name.length-hit),extra=Math.max(0,k-i+1-name.length);
   const score=(hit/name.length)*.80+(exact/name.length)*.20-.04*missing-.035*extra;
   best=Math.max(best,score);
  }
 }
 return best;
}
function rosterMatches(raw,head={}){
 if(!S.roster?.length)return [];
 const lines=String(raw||'').split(/\r?\n/).map(ocrTokens).filter(x=>x.length>=3&&x.length<=18);
 const pool=(head.g&&head.c)?S.roster.filter(x=>+x.g===+head.g&&String(x.c)===String(head.c)):
  head.g?S.roster.filter(x=>+x.g===+head.g):S.roster;
 const strict=(!head.g?0.96:head.c?0.80:0.88),gap=(!head.g?0.18:0.12);
 const picked=new Map();
 for(const tokens of lines){
  const ranked=[];
  for(const r of pool){const score=ocrNameScore(tokens,r);if(score>=strict-.16)ranked.push({r,score})}
  ranked.sort((a,b)=>b.score-a.score);
  if(!ranked.length)continue;
  const best=ranked[0],second=ranked[1];
  if(best.score<strict||(second&&best.score-second.score<gap))continue;
  picked.set(String(best.r.i),best.r);
 }
 return [...picked.values()];
}
function contextFor(msgs,idx,studentRows,date){
 const m=msgs[idx]||{head:{},who:'',min:0};let direct={...(m.head||{})};
 const choices=[];
 for(let j=Math.max(0,idx-5);j<=Math.min(msgs.length-1,idx+5);j++){
  const it=msgs[j];if(it.date!==date||(!it.head?.g&&!it.head?.p))continue;
  if(m.who&&it.who&&m.who!==it.who)continue;
  const delta=Math.abs((m.min||0)-(it.min||0));if(delta>40)continue;
  choices.push({head:it.head,rank:Math.abs(j-idx)*10+delta});
 }
 choices.sort((a,b)=>a.rank-b.rank);
 for(const {head} of choices){if(!direct.g&&head.g&&head.c){direct.g=head.g;direct.c=head.c}if(!direct.p&&head.p)direct.p=head.p;if(direct.g&&direct.p)break}
 if(!direct.g&&studentRows.length>=2){
  const counts=new Map();for(const r of studentRows){const key=r.g+'|'+r.c;counts.set(key,(counts.get(key)||0)+1)}
  const best=[...counts].sort((a,b)=>b[1]-a[1])[0];
  if(best&&best[1]/studentRows.length>=.8){const [g,c]=best[0].split('|');direct.g=+g;direct.c=c;direct.inferredClass=true}
 }
 return direct;
}
function buildSession(rows,h,date,desc,fromImage){
 if(!h?.g||!h?.c||!h?.p)return null;
 const members=rows.filter(x=>+x.g===+h.g&&String(x.c)===String(h.c));
 if(!members.length)return null;
 const dayWd=gd(date).getDay(),entry=ttFor(dayWd).find(x=>+x.g===+h.g&&x.c===h.c&&+x.p===+h.p&&!x.w);
 return {g:+h.g,c:String(h.c),p:+h.p,s:entry?.s||'',t:entry?.t||'',m:members.map(x=>({i:String(x.i),n:x.n})),partial:!!fromImage,note:desc+(h.inferredClass?' — الفصل مستنتج من الأسماء؛ يلزم المراجعة':'')};
}
function mergeSessions(items){
 const grouped=new Map();
 for(const s of items){const k=skey(s);if(grouped.has(k)){const old=grouped.get(k);old.m=mergeNames(old.m||[],s.m||[]);old.partial=old.partial&&s.partial;old.note=[old.note,s.note].filter(Boolean).join('؛ ').slice(0,900)}
 else grouped.set(k,s)}
 return [...grouped.values()];
}
async function getZip(file){await lib('zip');return JSZip.loadAsync(file)}
async function prepare(file,dates,update){
 const zip=await getZip(file),names=Object.keys(zip.files).filter(n=>!zip.files[n].dir),txtName=names.find(x=>x.toLowerCase().endsWith('.txt'));
 if(!txtName)throw Error('ملف ZIP لا يحتوي على نص المحادثة؛ لا أستطيع ربط الصور بتواريخ صحيحة.');
 const raw=await zip.files[txtName].async('string'),messages=cpMessages(raw),fileMap=new Map(names.map(n=>[fileName(n),n]));
 const dayItems=[],imageItems=[],issues=[];
 for(const date of dates){
  const local=filterChat(raw,date);if(!local.text.trim()){issues.push(hijri(date)+': لا توجد رسائل لهذا التاريخ');continue}
  const parsed=parseChat(local.text,{teachers:new Set()});
  for(const session of parsed.sessions){
   if(!session.g||!session.c||!session.p){issues.push(hijri(date)+': كشف نصي بلا فصل أو حصة واضحة');continue}
   const members=session.m.map(x=>matchName(x.n,session.g,session.c).i).filter(Boolean).map(i=>S.byId.get(i)).filter(Boolean);
   const built=buildSession(members,session,date,'من رسالة واتساب نصية — يرجى التأكد من الأسماء',false);
   if(built)dayItems.push({date,session:built,type:'text'});
  }
  const ms=messages.filter(x=>x.date===date);
  let attached=0;
  for(let idx=0;idx<messages.length;idx++){
   const msg=messages[idx];if(msg.date!==date)continue;
   for(const ref of msg.files||[]){
    if(!/\.(?:png|jpe?g|webp)$/i.test(ref))continue;
    const path=fileMap.get(fileName(ref));if(!path)continue;
    imageItems.push({date,msgIndex:idx,ref,path});attached++;
   }
  }
  if(!attached)issues.push(hijri(date)+': لا توجد صور مرفقة فعليًا في ZIP');
  update('تم العثور على '+attached+' صورة لتاريخ '+hijri(date));
 }
 if(!imageItems.length){
  const imageNames=names.filter(n=>/\.(?:png|jpe?g|webp)$/i.test(n));
  if(!imageNames.length){
   issues.push('ملف ZIP لا يحتوي على صور فعلية. أعد تصدير محادثة واتساب مع تضمين الوسائط، وليس النص فقط.');
  }else{
   const foundByDate=new Map();
   for(const msg of messages)for(const ref of msg.files||[]){
    if(!/\.(?:png|jpe?g|webp)$/i.test(ref)||!fileMap.has(fileName(ref))||!msg.date)continue;
    foundByDate.set(msg.date,(foundByDate.get(msg.date)||0)+1);
   }
   if(foundByDate.size){
    const suggested=[...foundByDate].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([day,count])=>day+' ('+count+' صورة)').join('، ');
    issues.push('الملف يحتوي على '+imageNames.length+' صورة، لكن لم ترتبط أي منها بالتاريخ المختار. التواريخ التي تحتوي على مرفقات مرتبطة بالمحادثة: '+suggested+'. أغلق المراجعة وأعد اختيار التاريخ الصحيح.');
   }else{
    issues.push('الملف يحتوي على '+imageNames.length+' صورة، لكن نص واتساب لا يحتوي على أسماء صور مرتبطة برسائلها أو أن الصور استُبعدت عند التصدير. أعد تصدير المحادثة مع الوسائط، ثم اختر تاريخ الرسائل.');
   }
  }
 }
 if(!S.roster?.length)issues.push('أسماء طلاب التحضير غير محمّلة. استورد نسخة بيانات التحضير JSON أولًا، ثم أعد التحليل.');
 return {zip,messages,dayItems,imageItems,issues};
}
function showResult(file,dates,items,issues,scanned,failed){
 const m=document.querySelector('#modal');m.hidden=false;
 const closeModal=()=>{m.onclick=null;m.hidden=true;m.innerHTML='';};
 const dated=new Map();for(const a of items){const key=a.date+'|'+skey(a.session);if(!dated.has(key))dated.set(key,{date:a.date,session:a.session,type:a.type});else{const prev=dated.get(key);prev.session.m=mergeNames(prev.session.m,a.session.m);prev.session.partial=prev.session.partial&&a.session.partial}}
 const sessions=[...dated.values()];
 const safe=s=>esc(String(s??''));
 const options=sessions.map((x,i)=>'<label class="dayitem" style="display:block;margin-bottom:8px"><input type="checkbox" data-offline-save="'+i+'" '+(x.type==='text'?'checked':'')+'> <b>'+safe(hijri(x.date))+'</b> — '+safe(GN[x.session.g]||x.session.g)+' / '+safe(x.session.c)+' — الحصة '+safe(PN[x.session.p]||x.session.p)+' — '+x.session.m.length+' اسمًا '+(x.type==='ocr'?'<span class="pill warn">OCR: راجع الأسماء</span>':'')+'<details style="padding:5px 22px"><summary>عرض أسماء الكشف</summary>'+x.session.m.map(y=>'<div>'+safe(y.n)+'</div>').join('')+'</details></label>').join('');
 const zeroHelp=(!sessions.length&&scanned===0&&failed===0)?'<div class="notice" style="border:1px solid #d69753;background:#fff6ea;color:#744414;padding:12px;border-radius:9px"><b>لم تُقرأ أي صورة من التاريخ المختار.</b> افتح أسباب المراجعة أدناه؛ قد تكون صور واتساب غير مرفقة أو مرتبطة بتاريخ مختلف. لم تُحفظ أي بيانات.</div>':'';
 m.innerHTML='<div class="card stack" style="max-width:760px;max-height:92dvh;overflow:hidden;display:flex;flex-direction:column"><div class="row" style="align-items:center;justify-content:space-between;flex-shrink:0"><h2 style="margin:0">نتائج الاستيراد المحلي — مراجعة قبل الحفظ</h2><button class="btn" type="button" id="offlineCloseTop" aria-label="إغلاق نافذة الاستيراد">✕ إغلاق</button></div><p class="muted">قُرئت '+scanned+' صورة، وتعذّرت '+failed+'. عدد الكشوف المستخرجة: '+sessions.length+'. قراءة الصور تقديرية ويجب التأكد من الأسماء والفصول والحصص.</p>'+zeroHelp+'<div class="daylist" style="max-height:45vh;overflow:auto;min-height:0;flex:1">'+(options||'<div class="notice">لم أجد كشوفًا محددة بدقة كافية للحفظ.</div>')+'</div>'+(issues.length?'<details '+(!sessions.length?'open':'')+'><summary>صور أو أيام تحتاج مراجعة ('+issues.length+')</summary><div class="log" style="max-height:120px;overflow:auto">'+issues.map(safe).join('\n')+'</div></details>':'')+'<div class="row" style="position:sticky;bottom:0;flex-shrink:0;background:var(--panel,#fff);padding:12px 0 6px;border-top:1px solid var(--line,#ddd)"><button class="btn primary" id="offlineSave" '+(sessions.length?'':'disabled')+'>حفظ الكشوف المحددة</button><button class="btn" type="button" id="offlineClose">إغلاق دون حفظ</button></div><div id="offlineSaveStatus"></div></div>';
 m.onclick=async e=>{
  if(e.target.closest('#offlineClose,#offlineCloseTop,#offlineDone')){closeModal();return}
  if(e.target.id!=='offlineSave')return;
  const selected=[...m.querySelectorAll('[data-offline-save]:checked')].map(x=>sessions[+x.dataset.offlineSave]);
  if(!selected.length){m.querySelector('#offlineSaveStatus').textContent='حدد كشفًا واحدًا على الأقل';return}
  if(!confirm('هل راجعت أسماء الطلاب والتاريخ والفصل والحصة في '+selected.length+' كشفًا؟ ستُضاف إلى الأيام الموجودة أو تُنشأ أيام جديدة.'))return;
  const saveButton=e.target;saveButton.disabled=true;const byDate=new Map();for(const x of selected){if(!byDate.has(x.date))byDate.set(x.date,[]);byDate.get(x.date).push(x.session)}
  let created=0,updated=0,cnt=0;const errors=[];
  for(const [date,list] of byDate)try{
    const old=await getDoc('days/'+date),day=old||{date,wd:gd(date).getDay(),label:hijri(date),sessions:[]};
    for(const ss of list){const oldSession=day.sessions.find(x=>skey(x)===skey(ss));if(oldSession){oldSession.m=mergeNames(oldSession.m||[],ss.m||[]);if(ss.note&&!String(oldSession.note||'').includes(ss.note))oldSession.note=[oldSession.note,ss.note].filter(Boolean).join(' — ').slice(0,1300)}
    else{day.sessions.push(ss);cnt++}}
    day.updatedAt=new Date().toISOString();
    if(!await setDoc('days/'+date,day))throw new Error('تعذّر حفظ اليوم');
    const index=S.index.find(x=>x.date===date);if(index)index.count=day.sessions.length;else S.index.push({date,label:day.label,wd:day.wd,count:day.sessions.length});
    if(old)updated++;else created++;
   }catch(err){errors.push(hijri(date)+': '+(err.message||err))}
  try{if(!await saveIndex())errors.push('تعذّر حفظ فهرس الأيام')}catch(err){errors.push('فهرس الأيام: '+(err.message||err))}
  S.allDays=null;S.stuStats=null;S.index.sort((a,b)=>b.date.localeCompare(a.date));
  const summary='تم إنشاء '+created+' يوم وتحديث '+updated+' يوم وإضافة '+cnt+' كشف جديد.';
  if(!errors.length){
    m.innerHTML='<div class="card stack" style="width:min(600px,95vw);padding:24px;text-align:center"><div style="font-size:44px;color:#157856">✓</div><h2 style="margin:4px 0">تم الحفظ بنجاح</h2><p style="line-height:1.9">'+summary+'</p><p class="muted">يمكنك إغلاق النافذة الآن. البيانات المحفوظة لم تُحذف أو تُستبدل.</p><button class="btn primary" id="offlineDone" type="button" style="width:100%;min-height:52px">✓ تم — إغلاق النافذة</button></div>';
    m.onclick=e=>{if(e.target.closest('#offlineDone'))closeModal()};
    toast('حُفظت الكشوف المحددة بنجاح');
  }else{
    const status=m.querySelector('#offlineSaveStatus');
    if(status)status.textContent=summary+' بعض التواريخ لم تكتمل: '+errors.join('؛ ')+'. يمكنك مراجعتها أو إغلاق النافذة.';
    saveButton.disabled=false;
  }
 };
}
async function run(file,dates,prepared=null){
 const m=document.querySelector('#modal');m.hidden=false;cancelled=false;let dismissed=false;
 m.innerHTML='<div class="card stack" style="max-width:610px"><h2>قراءة مجانية داخل المتصفح</h2><p class="muted">لن تُرسل الصور إلى Anthropic، ولن تُحفظ بيانات إلا بعد المراجعة.</p><div id="localOcrStatus" class="muted">جارٍ تجهيز الملفات…</div><div class="row"><button class="btn" id="localOcrStop">إيقاف القراءة ومراجعة ما تم استخراجه</button><button class="btn danger" id="localOcrDismiss">✕ إيقاف وإغلاق دون حفظ</button></div></div>';
 m.onclick=e=>{const b=e.target.closest('button');if(b?.id==='localOcrStop'){cancelled=true;b.disabled=true;update('جارٍ إيقاف القراءة؛ ستظهر الكشوف التي تم استخراجها فقط.')}if(b?.id==='localOcrDismiss'){cancelled=true;dismissed=true;m.onclick=null;m.hidden=true;m.innerHTML='';}};
 const update=t=>{const el=document.querySelector('#localOcrStatus');if(el)el.textContent=t};
 let data;try{data=prepared||await prepare(file,dates,update);if(dismissed)return}catch(e){update('تعذّر تحليل المحادثة: '+(e.message||e));return}
 let {zip,messages,dayItems,imageItems,issues}=data,read=0,failed=0,worker=null;const totalImages=data.imageTotal??imageItems.length;
 if(totalImages){
  try{
   update('جارٍ تحميل محرك القراءة العربية المحلي…');
   await new Promise((resolve,reject)=>{if(window.Tesseract)return resolve();const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('تعذّر تنزيل محرك OCR من الشبكة'));document.head.appendChild(script)});
   worker=await window.Tesseract.createWorker('ara+eng');
   let i=0;for await (const image of imageItems){
    if(cancelled)break;
    update('قراءة الصورة '+(++i)+' من '+totalImages+' بتاريخ '+hijri(image.date));
    try{
     const bytes=image.blob||await zip.files[image.path].async('blob');
     const bitmap=await createImageBitmap(bytes);
     const scale=Math.min(2.2,Math.max(1,1650/Math.max(1,bitmap.width)));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
     const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
     const recognized=await worker.recognize(canvas),rows=rosterMatches(recognized.data.text||'');
     const head={...contextFor(messages,image.msgIndex??0,rows,image.date),...(image.head||{})};
     const session=buildSession(rows,head,image.date,'قراءة صورة واتساب محلية — راجع الأسماء',true);
     if(session){dayItems.push({date:image.date,session,type:'ocr'});}
     else issues.push(hijri(image.date)+': '+image.ref+' — لم أتعرف على أسماء وفصل وحصة بثقة كافية');
     read++;
    }catch(e){failed++;issues.push(image.ref+': '+(e.message||e))}
    if(i%3===0)await new Promise(ok=>setTimeout(ok,0));
   }
  }catch(e){issues.push('محرك OCR غير متاح: '+(e.message||e))}
  finally{if(worker)await worker.terminate()}
 }
 if(!dismissed)showResult(file,dates,dayItems,issues,read,failed);
}
window.shMadrasatiOfflineImport=run;
})();