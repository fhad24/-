(()=>{
'use strict';
const digit=s=>String(s).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
const clean=s=>digit(String(s||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')).trim();
function group(text){
 const t=clean(text).replace(/الصف|ثانوي|الثانوي|الفصل|صف/g,' ').replace(/الأول/g,'اول').replace(/الثاني/g,'ثاني').replace(/الثالث/g,'ثالث');
 const m=t.match(/(?:^|[\s:/-])(اول|ثاني|ثالث|[123])\s*(?:ث)?\s*(?:[/\\\- ]\s*)?([أابجدهـو زح])(?=\s|$|[،.:])/);
 if(!m)return null;
 return {g:({اول:1,ثاني:2,ثالث:3})[m[1]]||+m[1],c:m[2]==='ا'?'أ':m[2]==='ه'?'هـ':m[2]};
}
function period(t){
 const s=clean(t).replace(/الحصه|الحصة|حصه/g,'حصة');
 const m=s.match(/حصة\s*(الاولى|الأولى|الثانيه|الثانية|الثالثه|الثالثة|الرابعه|الرابعة|الخامسه|الخامسة|السادسه|السادسة|السابعه|السابعة|[1-7])/);
 if(!m)return null;
 const n=m[1];return ({الاولى:1,'الأولى':1,الثانيه:2,الثانية:2,الثالثه:3,الثالثة:3,الرابعه:4,الرابعة:4,الخامسه:5,الخامسة:5,السادسه:6,السادسة:6,السابعه:7,السابعة:7})[n]||+n;
}
function parse(txt){
 const lines=String(txt).split(/\r?\n/),messages=[];
 const start=/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*[،,]\s*(\d{1,2}):(\d{2})\s*([صم]?)\s*-\s*(.+)$/;
 for(const line of lines){const v=clean(line),m=v.match(start);
 if(m){const body=m[7],colon=body.indexOf(': '),sender=colon>=0?body.slice(0,colon):'',text=colon>=0?body.slice(colon+2):body,h=+m[4]%12+((m[6]==='م')?12:0);
 const date=[m[3],m[2].padStart(2,'0'),m[1].padStart(2,'0')].join('-');
 messages.push({date,time:h*60+(+m[5]),sender,text,files:[],ctx:group(text),period:period(text)});
 }else if(messages.length){messages[messages.length-1].text+='\n'+v;const last=messages[messages.length-1];last.ctx=last.ctx||group(v);last.period=last.period||period(v)}}
 for(const m of messages){m.files=[...m.text.matchAll(/(IMG-[\w-]+\.(?:png|jpe?g|webp)|[^\s<>]+\.(?:png|jpe?g|webp))/gi)].map(x=>x[1].split('/').pop())}
 const attached=[];messages.forEach((m,i)=>{for(const name of m.files)attached.push({name,messageIndex:i,date:m.date,time:m.time,sender:m.sender})});
 for(const a of attached){
 const i=a.messageIndex,base=messages[i],windowCandidates=[];
 for(let j=Math.max(0,i-4);j<=Math.min(messages.length-1,i+5);j++){const msg=messages[j];if(msg.date!==a.date||!msg.ctx&&!msg.period)continue;
 if(msg.sender&&base.sender&&msg.sender!==base.sender)continue;
 const dist=Math.abs(j-i),time=Math.abs(msg.time-a.time);
 if(time>35)continue;
 windowCandidates.push({msg,score:dist*10+time+(j<i?3:0)})}
 windowCandidates.sort((x,y)=>x.score-y.score);
 const best=windowCandidates[0]?.msg;
 a.g=best?.ctx?.g||null;a.c=best?.ctx?.c||null;a.p=best?.period||null;a.context=best?.text?.slice(0,160)||'';
 a.confidence=a.g&&a.c&&a.p?'high':a.g&&a.c?'medium':'review';
 }
 return attached;
}
window.shWhatsAppContext={parse,clean};
})();