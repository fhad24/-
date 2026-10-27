(function(){
'use strict';
let cancelled=false;
const fileName=x=>String(x||'').split('/').pop().toLowerCase();
const fmt=x=>String(x||'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[ً-ْـ]/g,'').replace(/[^ء-ي\s]/g,' ').replace(/\s+/g,' ').trim();
function words(x){return fmt(x).split(/\s+/).filter(w=>w.length>1&&!['بن','ابن','بنت'].includes(w))}
function sameName(text,r){
 const name=words(r.n).join(' ');if(name.length<9)return false;
 const t=fmt(text);if(t.includes(name))return true;
 const w=words(r.n);if(w.length<4)return false;
 const lines=t.split(/\n/);
 for(const v of lines){const toks=new Set(v.split(' '));const hits=w.filter(z=>toks.has(z));if(hits.length>=Math.max(3,Math.ceil(w.length*.75))&&hits.includes(w[0])&&hits.includes(w[w.length-1]))return true}
 return false;
}
function rosterMatches(raw){
 const text=String(raw||'').split(/\r?\n/).map(x=>fmt(x)).join('\n');
 return S.roster.filter(r=>sameName(text,r));
}
function contextFor(msgs,idx,studentRows,date){
 const m=msgs[idx];let direct={...(m.head||{})};
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
 return {zip,messages,dayItems,imageItems,issues};
}
function showResult(file,dates,items,issues,scanned,failed){
 const m=document.querySelector('#modal');m.hidden=false;
 const all=mergeSessions(items.map(x=>x.session));
 const dated=new Map();for(const a of items){const key=a.date+'|'+skey(a.session);if(!dated.has(key))dated.set(key,{date:a.date,session:a.session,type:a.type});else{const prev=dated.get(key);prev.session.m=mergeNames(prev.session.m,a.session.m);prev.session.partial=prev.session.partial&&a.session.partial}}
 const sessions=[...dated.values()];
 const safe=s=>esc(String(s??''));
 const options=sessions.map((x,i)=>'<label class="dayitem" style="display:block;margin-bottom:8px"><input type="checkbox" data-offline-save="'+i+'" '+(x.type==='text'?'checked':'')+'> <b>'+safe(hijri(x.date))+'</b> — '+safe(GN[x.session.g]||x.session.g)+' / '+safe(x.session.c)+' — الحصة '+safe(PN[x.session.p]||x.session.p)+' — '+x.session.m.length+' اسمًا '+(x.type==='ocr'?'<span class="pill warn">OCR: راجع الأسماء</span>':'')+'<details style="padding:5px 22px"><summary>عرض أسماء الكشف</summary>'+x.session.m.map(y=>'<div>'+safe(y.n)+'</div>').join('')+'</details></label>').join('');
 m.innerHTML='<div class="card stack" style="max-width:760px"><h2>نتائج الاستيراد المحلي — مراجعة قبل الحفظ</h2><p class="muted">قُرئت '+scanned+' صورة، وتعذّرت '+failed+'. عدد الكشوف المستخرجة: '+sessions.length+'. قراءة الصور تقديرية ويجب التأكد من الأسماء والفصول والحصص.</p><div class="daylist" style="max-height:45vh;overflow:auto">'+(options||'<div class="notice">لم أجد كشوفًا محددة بدقة كافية للحفظ.</div>')+'</div>'+(issues.length?'<details><summary>صور أو أيام تحتاج مراجعة ('+issues.length+')</summary><div class="log" style="max-height:120px;overflow:auto">'+issues.map(safe).join('\n')+'</div></details>':'')+'<div class="row"><button class="btn primary" id="offlineSave" '+(sessions.length?'':'disabled')+'>حفظ الكشوف المحددة</button><button class="btn" id="offlineClose">إغلاق دون حفظ</button></div><div id="offlineSaveStatus"></div></div>';
 m.onclick=async e=>{
  if(e.target.id==='offlineClose'){m.hidden=true;return}
  if(e.target.id!=='offlineSave')return;
  const selected=[...m.querySelectorAll('[data-offline-save]:checked')].map(x=>sessions[+x.dataset.offlineSave]);
  if(!selected.length){m.querySelector('#offlineSaveStatus').textContent='حدد كشفًا واحدًا على الأقل';return}
  if(!confirm('هل راجعت أسماء الطلاب والتاريخ والفصل والحصة في '+selected.length+' كشفًا؟ ستُضاف إلى الأيام الموجودة أو تُنشأ أيام جديدة.'))return;
  e.target.disabled=true;const byDate=new Map();for(const x of selected){if(!byDate.has(x.date))byDate.set(x.date,[]);byDate.get(x.date).push(x.session)}
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
  if(!await saveIndex())errors.push('تعذّر حفظ فهرس الأيام');
  m.querySelector('#offlineSaveStatus').textContent='تم إنشاء '+created+' يوم وتحديث '+updated+' يوم وإضافة '+cnt+' كشف جديد.'+(errors.length?' أخطاء: '+errors.join('؛ '):'');
  if(errors.length)e.target.disabled=false;
 };
}
async function run(file,dates){
 const m=document.querySelector('#modal');m.hidden=false;cancelled=false;
 m.innerHTML='<div class="card stack" style="max-width:610px"><h2>قراءة مجانية داخل المتصفح</h2><p class="muted">لن تُرسل الصور إلى Anthropic، ولن تُحفظ بيانات إلا بعد المراجعة.</p><div id="localOcrStatus" class="muted">جارٍ تجهيز الملفات…</div><button class="btn" id="localOcrStop">إيقاف القراءة ومراجعة ما تم استخراجه</button></div>';
 m.onclick=e=>{if(e.target.id==='localOcrStop'){cancelled=true;e.target.disabled=true}};
 const update=t=>{const el=document.querySelector('#localOcrStatus');if(el)el.textContent=t};
 let data;try{data=await prepare(file,dates,update)}catch(e){update('تعذّر تحليل المحادثة: '+(e.message||e));return}
 let {zip,messages,dayItems,imageItems,issues}=data,read=0,failed=0,worker=null;
 if(imageItems.length){
  try{
   update('جارٍ تحميل محرك القراءة العربية المحلي…');
   await new Promise((resolve,reject)=>{if(window.Tesseract)return resolve();const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('تعذّر تنزيل محرك OCR من الشبكة'));document.head.appendChild(script)});
   worker=await window.Tesseract.createWorker('ara+eng');
   for(const [i,image] of imageItems.entries()){
    if(cancelled)break;
    update('قراءة الصورة '+(i+1)+' من '+imageItems.length+' بتاريخ '+hijri(image.date));
    try{
     const bytes=await zip.files[image.path].async('blob');
     const bitmap=await createImageBitmap(bytes);
     const scale=Math.min(2.2,Math.max(1,1650/Math.max(1,bitmap.width)));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
     const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
     const recognized=await worker.recognize(canvas),rows=rosterMatches(recognized.data.text||'');
     const head=contextFor(messages,image.msgIndex,rows,image.date);
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
 showResult(file,dates,dayItems,issues,read,failed);
}
window.shMadrasatiOfflineImport=run;
})();