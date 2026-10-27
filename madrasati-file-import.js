(()=>{'use strict';
const q=x=>document.querySelector(x);let scanned='',images=[],preview=[];
function msg(s){q('#fileImportStatus').textContent=s}
function lib(url,global){return new Promise((ok,no)=>{if(window[global])return ok(window[global]);const sc=document.createElement('script');sc.src=url;sc.onload=()=>ok(window[global]);sc.onerror=()=>no(Error('تعذر تحميل مكتبة قراءة الملفات: '+global));document.head.appendChild(sc)})}
function tidy(s){return String(s||'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ً-ْـ]/g,'').replace(/\s+/g,' ').trim()}
function textOfChat(raw){return String(raw).replace(/\u200e|\u200f/g,'').split('\n').filter(line=>!/(\bPTT-|\bSTK-|<تم استبعاد الوسائط>)/i.test(line)).join('\n')}
async function extract(f){
 const name=f.name.toLowerCase();
 if(name.endsWith('.txt')||name.endsWith('.csv'))return await f.text();
 if(name.endsWith('.zip')){await lib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js','JSZip');const z=await JSZip.loadAsync(f);const out=[];for(const [n,x] of Object.entries(z.files)){if(x.dir)continue;const lower=n.toLowerCase();if(lower.endsWith('.txt')||lower.endsWith('.csv'))out.push(await x.async('string'));if(/\.(png|jpe?g|webp)$/i.test(lower))images.push(new File([await x.async('blob')],n,{type:'image/jpeg'}));if(lower.endsWith('.pdf')){const b=await x.async('blob');out.push(await extract(new File([b],n,{type:'application/pdf'})))}if(lower.endsWith('.docx'))out.push(await extract(new File([await x.async('blob')],n)))}return out.join('\n')}
 if(name.endsWith('.xlsx')||name.endsWith('.xls')){await lib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','XLSX');const wb=XLSX.read(await f.arrayBuffer());return wb.SheetNames.map(n=>XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n')}
 if(name.endsWith('.docx')){await lib('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.9.0/mammoth.browser.min.js','mammoth');return(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value}
 if(name.endsWith('.pdf')){await lib('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjsLib');pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const doc=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;let out=[];for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();out.push(content.items.map(x=>x.str).join(' '))}return out.join('\n')}
 if(/\.(jpg|jpeg|png|webp)$/i.test(name)){images.push(f);return ''}
 throw Error('نوع الملف غير مدعوم: '+f.name);
}
function match(){
 const grade=q('#grade').value,cls=q('#cls').value,eligible=roster.filter(r=>String(r.g)===grade&&String(r.c)===cls);
 const tokens=tidy(textOfChat(scanned)).split(/\n/).map(tidy);const blob=tidy(scanned);
 preview=eligible.filter(r=>{const n=tidy(r.n);return n.length>=8&&(tokens.some(t=>t===n||t.includes(n))||blob.includes(n))});
 q('#fileImportMatches').textContent='أسماء مطابقة داخل الفصل المختار: '+preview.length+' من '+eligible.length+'. راجع الأسماء قبل اعتماد الحضور.';
 q('#fileImportNames').innerHTML=preview.map(r=>'<label style="display:block;padding:6px"><input type="checkbox" checked data-import-id="'+r.i+'"> '+r.n+'</label>').join('')||'لا توجد أسماء مطابقة تلقائيًا.';
}
async function ocr(){
 if(!images.length)return msg('لا توجد صور للتحليل.');if(!confirm('تحليل '+images.length+' صورة على جهازك قد يكون بطيئًا. هل تواصل؟'))return;
 try{msg('جارٍ تحميل أداة التعرف على النصوص العربية…');await lib('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','Tesseract');
 const worker=await Tesseract.createWorker('ara+eng');let n=0;
 try{for(const f of images){msg('قراءة الصورة '+(++n)+' من '+images.length+' — '+f.name);try{const r=await worker.recognize(f);scanned+='\n'+r.data.text}catch(e){scanned+='\n';console.warn('OCR image',f.name,e)}}}finally{await worker.terminate()}
 msg('اكتملت قراءة '+n+' صورة. النتائج تحتاج مراجعة قبل الحفظ.');match()
 }catch(e){msg('تعذر التعرف على الصور: '+e.message)}
}
function start(){
 const panel=document.createElement('div');panel.className='panel';panel.innerHTML='<h2 class="heading">📥 استيراد كشف حضور من الملفات</h2><p class="hint">استيراد ZIP (محادثة واتساب وصورها) أو PDF أو Word DOCX أو Excel أو TXT. تتم مطابقة الأسماء مع الصف والفصل المختارين، ولا تُحفظ أي بيانات قبل مراجعتها.</p><input type="file" id="fileImportPicker" multiple accept=".zip,.pdf,.docx,.xlsx,.xls,.txt,.csv,.jpg,.jpeg,.png,.webp"><div class="actions" style="margin-top:12px"><button id="fileImportRead" class="primary">قراءة الملفات</button><button id="fileImportOcr">قراءة الصور الموجودة (اختياري)</button><button id="fileImportApply">إضافة الأسماء المحددة إلى التحضير</button></div><p id="fileImportStatus" class="hint">اختر الملفات ثم اضغط قراءة الملفات</p><p id="fileImportMatches" class="hint"></p><div id="fileImportNames" style="max-height:280px;overflow:auto"></div><p class="notice">صور كشوف واتساب تحتاج OCR وقد تظهر أخطاء في قراءة الأسماء؛ راجع النتائج قبل الحفظ. لا تُرسل الملفات إلى Claude.</p>';
 q('#att').insertBefore(panel,q('#att').children[1]);
 q('#fileImportRead').onclick=async()=>{const fs=[...q('#fileImportPicker').files];if(!fs.length)return msg('اختر ملفًا أولًا');scanned='';images=[];preview=[];try{for(const f of fs){msg('قراءة '+f.name);scanned+='\n'+await extract(f)}msg('قُرئت '+fs.length+' ملفات. وُجدت '+images.length+' صورة. يمكنك قراءة الصور إذا لزم.');match()}catch(e){msg('تعذر الاستيراد: '+e.message)}};
 q('#fileImportOcr').onclick=ocr;
 q('#fileImportApply').onclick=()=>{const ids=[...document.querySelectorAll('[data-import-id]:checked')].map(x=>String(x.dataset.importId));for(const id of ids)selected.add(id);dirty=true;renderList();msg('تم تحديد '+ids.length+' طالبًا في كشف التحضير. راجع الطلاب ثم اضغط «حفظ التحضير». لا يوجد حفظ تلقائي.')};
 q('#grade').addEventListener('change',()=>{if(scanned)match()});q('#cls').addEventListener('change',()=>{if(scanned)match()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();