/* Fast monthly/all-weeks attendance totals. Prevents observer feedback loops and repeated full-table work. */
(function(){
  const state={scheduled:false,running:false,rerun:false,wrapped:false,observer:null,observedBody:null};
  const monthCache=new Map();
  let weekCache=null;

  function mode(){
    const v=String(document.getElementById('weeklyAttWeek')?.value||'');
    return v==='monthly'||v==='all'?v:'weekly';
  }

  function hijriMonthKey(dateKey){
    const k=String(dateKey||'');
    if(monthCache.has(k)) return monthCache.get(k);
    let out='';
    try{
      const p=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'2-digit'})
        .formatToParts(new Date(k+'T12:00:00'));
      out=(p.find(x=>x.type==='year')?.value||'')+'-'+(p.find(x=>x.type==='month')?.value||'');
    }catch(e){}
    monthCache.set(k,out);
    return out;
  }

  function ensureSource(){
    if(window.__EXCEL_ATTENDANCE_TRUTH_20261010) return Promise.resolve(true);
    return new Promise(resolve=>{
      if(document.querySelector('script[data-excel-attendance-source]')){
        setTimeout(()=>resolve(!!window.__EXCEL_ATTENDANCE_TRUTH_20261010),120);
        return;
      }
      const s=document.createElement('script');
      s.dataset.excelAttendanceSource='1';
      s.src='/attendance-excel-fix.js?v=20261011-fast2';
      s.onload=()=>resolve(true);
      s.onerror=()=>resolve(false);
      document.head.appendChild(s);
    });
  }

  const VACATION_WEEK_5=new Set(['2026-09-20','2026-09-21','2026-09-22','2026-09-23','2026-09-24']);

  function getWeeks(){
    if(weekCache) return weekCache;
    const out=[];
    try{
      for(let n=1;n<=19;n++){
        if(n===5) continue;
        const dates=typeof weeklyAttFixedWeekGregorianDates==='function'?weeklyAttFixedWeekGregorianDates(String(n)):[];
        if(dates?.length===5) out.push(dates.map(String));
      }
    }catch(e){}
    weekCache=out;
    return out;
  }

  function buildExtraAttendanceMap(E,selectedMode,selectedMonth){
    const byId=new Map();
    let rows=[];
    try{ rows=typeof getAttendanceLog==='function'?(getAttendanceLog()||[]):[]; }catch(e){}
    const sourceDates=new Set(E.dates||[]);
    for(const r of rows){
      const id=String(r?.idno||'').trim(), d=String(r?.date||'');
      if(!id||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)||sourceDates.has(d)||VACATION_WEEK_5.has(d)) continue;
      if(selectedMode==='monthly' && selectedMonth && hijriMonthKey(d)!==selectedMonth) continue;
      let map=byId.get(id);
      if(!map){ map=new Map(); byId.set(id,map); }
      const prev=map.get(d);
      if(r.status==='present'||r.status==='late') map.set(d,'present');
      else if(r.status==='absent' && prev!=='present') map.set(d,'absent');
    }
    return byId;
  }

  function reconnectObserver(){
    const body=document.getElementById('weeklyAttBody');
    if(!body) return;
    if(body!==state.observedBody){
      state.observer?.disconnect();
      state.observedBody=body;
    }
    if(!state.observer) state.observer=new MutationObserver(()=>schedule());
    state.observer.disconnect();
    state.observer.observe(body,{childList:true});
  }

  async function run(){
    state.scheduled=false;
    if(state.running){ state.rerun=true; return; }
    const selectedMode=mode();
    if(selectedMode==='weekly') return;
    state.running=true;
    state.observer?.disconnect();
    try{
      if(!window.__EXCEL_ATTENDANCE_TRUTH_20261010){
        const ok=await ensureSource();
        if(!ok) return;
      }
      const E=window.__EXCEL_ATTENDANCE_TRUTH_20261010;
      if(!E?.map) return;

      const table=document.querySelector('#weeklyAttSheet table');
      if(!table) return;

      const selectedMonth=String(document.getElementById('weeklyAttHijriMonthSelect')?.value||'');
      const sourceDates=(E.dates||[]).map(String).filter(d=>!VACATION_WEEK_5.has(d));
      const sourceIndex=new Map(sourceDates.map(d=>[d,(E.dates||[]).indexOf(d)]));
      const relevantSource=selectedMode==='monthly'&&selectedMonth
        ?sourceDates.filter(d=>hijriMonthKey(d)===selectedMonth):sourceDates;
      const extraById=buildExtraAttendanceMap(E,selectedMode,selectedMonth);
      const weeks=getWeeks();

      const hs=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').replace(/\s+/g,' ').trim());
      const ci=hs.findIndex(x=>x.includes('السجل المدني'));
      const pi=hs.findIndex(x=>/^حاضر/.test(x));
      const ai=hs.findIndex(x=>/^غائب/.test(x));
      const coi=hs.findIndex(x=>x.includes('أيام محسوبة'));
      const ri=hs.findIndex(x=>x.includes('نسبة الحضور'));
      const gi=hs.findIndex(x=>x.includes('غياب الشهر')||x.includes('الغياب حتى الآن'));
      if(ci<0||pi<0||ai<0) return;

      let totalP=0,totalA=0,studentRows=0;
      const rows=[...table.querySelectorAll('tbody tr')];

      for(const tr of rows){
        const td=[...tr.children];
        if(!td[ci]) continue;
        const id=String(td[ci].textContent||'').replace(/\D/g,'');
        if(!id) continue;
        const mask=E.map.get(id);
        const extra=extraById.get(id);
        let present=0,absent=0;

        const statusFor=(d)=>{
          if(VACATION_WEEK_5.has(d)) return null;
          const originalIdx=(E.dates||[]).indexOf(d);
          if(originalIdx>=0){
            const bit=1<<originalIdx;
            return mask && (mask[0]&bit)?'present':'absent';
          }
          return extra?.get(d)||null;
        };

        const forcedThursday=new Set();
        for(const wd of weeks){
          const thu=wd[4];
          if(selectedMode==='monthly'&&selectedMonth&&hijriMonthKey(thu)!==selectedMonth) continue;
          if(wd.slice(0,4).some(d=>statusFor(d)==='present')) forcedThursday.add(thu);
        }

        for(const d of relevantSource){
          const v=forcedThursday.has(d)?'present':statusFor(d);
          if(v==='present') present++; else if(v==='absent') absent++;
        }
        if(extra){
          for(const [d,v0] of extra){
            if(relevantSource.includes(d)) continue;
            if(selectedMode==='monthly'&&selectedMonth&&hijriMonthKey(d)!==selectedMonth) continue;
            const v=forcedThursday.has(d)?'present':v0;
            if(v==='present') present++; else if(v==='absent') absent++;
          }
        }

        const counted=present+absent;
        const rate=counted?Math.round(present/counted*100):0;
        const set=(idx,val)=>{
          if(idx<0||!td[idx]) return;
          const target=td[idx].querySelector('b')||td[idx];
          const s=String(val);
          if(target.textContent!==s) target.textContent=s;
        };
        set(pi,present); set(ai,absent); set(coi,counted); set(ri,rate+'%'); set(gi,absent);
        totalP+=present; totalA+=absent; studentRows++;
      }

      if(studentRows){
        const p=document.getElementById('weeklyAttPresentCount');
        const a=document.getElementById('weeklyAttAbsentCount');
        if(p&&p.textContent!==String(totalP)) p.textContent=String(totalP);
        if(a&&a.textContent!==String(totalA)) a.textContent=String(totalA);
      }
    }catch(e){
      console.warn('fast attendance totals patch',e);
    }finally{
      state.running=false;
      reconnectObserver();
      if(state.rerun){ state.rerun=false; schedule(); }
    }
  }

  function schedule(){
    if(state.running){ state.rerun=true; return; }
    if(state.scheduled) return;
    state.scheduled=true;
    requestAnimationFrame(()=>setTimeout(run,0));
  }

  function wrapRenderer(){
    if(state.wrapped || typeof window.renderWeeklyAttendanceReport!=='function') return;
    const original=window.renderWeeklyAttendanceReport;
    window.renderWeeklyAttendanceReport=function(){
      state.observer?.disconnect();
      const out=original.apply(this,arguments);
      reconnectObserver();
      schedule();
      return out;
    };
    state.wrapped=true;
  }

  function boot(){
    wrapRenderer();
    reconnectObserver();
    const ids=['weeklyAttWeek','weeklyAttHijriMonthSelect','weeklyAttGrade','weeklyAttClass','weeklyAttStudentSearch','weeklyAttStudentSelect'];
    ids.forEach(id=>{
      const el=document.getElementById(id);
      if(el&&!el.dataset.fastTotalsHook){
        el.dataset.fastTotalsHook='1';
        el.addEventListener(id==='weeklyAttStudentSearch'?'input':'change',schedule,{passive:true});
      }
    });
    schedule();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  setTimeout(boot,300);
})();

/* VACATION_WEEK_5: week 5 excluded globally from attendance totals. */
