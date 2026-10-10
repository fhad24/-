/* Lightweight exact Excel attendance totals for monthly/all-weeks reports */
(function(){
  const state={scheduled:false,wrapped:false,observer:null,observedBody:null};

  function mode(){
    const v=String(document.getElementById('weeklyAttWeek')?.value||'');
    return v==='monthly'||v==='all'?v:'weekly';
  }

  function hijriMonthKey(dateKey){
    try{
      const p=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'2-digit'})
        .formatToParts(new Date(String(dateKey)+'T12:00:00'));
      return (p.find(x=>x.type==='year')?.value||'')+'-'+(p.find(x=>x.type==='month')?.value||'');
    }catch(e){ return ''; }
  }

  function ensureSource(){
    if(window.__EXCEL_ATTENDANCE_TRUTH_20261010) return Promise.resolve(true);
    return new Promise(resolve=>{
      if(document.querySelector('script[data-excel-attendance-source]')) {
        setTimeout(()=>resolve(!!window.__EXCEL_ATTENDANCE_TRUTH_20261010),120);
        return;
      }
      const s=document.createElement('script');
      s.dataset.excelAttendanceSource='1';
      s.src='/attendance-excel-fix.js?v=20261010-10';
      s.onload=()=>resolve(true);
      s.onerror=()=>resolve(false);
      document.head.appendChild(s);
    });
  }

  function vacationWeek5Dates(){
    return new Set(['2026-09-20','2026-09-21','2026-09-22','2026-09-23','2026-09-24']);
  }

  function buildExtraAttendanceMap(E,selectedMode,selectedMonth){
    const byId=new Map();
    let rows=[];
    try{ rows=typeof getAttendanceLog==='function'?(getAttendanceLog()||[]):[]; }catch(e){}
    const sourceDates=new Set(E.dates||[]);
    const VACATION_WEEK_5=vacationWeek5Dates();
    for(const r of rows){
      const id=String(r?.idno||'').trim();
      const d=String(r?.date||'');
      if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(d)||sourceDates.has(d)||VACATION_WEEK_5.has(d)) continue;
      if(selectedMode==='monthly' && selectedMonth && hijriMonthKey(d)!==selectedMonth) continue;
      let map=byId.get(id);
      if(!map){ map=new Map(); byId.set(id,map); }
      const prev=map.get(d);
      if(r.status==='present'||r.status==='late') map.set(d,'present');
      else if(r.status==='absent' && prev!=='present') map.set(d,'absent');
    }
    return byId;
  }

  async function run(){
    state.scheduled=false;
    const selectedMode=mode();
    if(selectedMode==='weekly') return;
    if(!window.__EXCEL_ATTENDANCE_TRUTH_20261010){
      const ok=await ensureSource();
      if(!ok) return;
    }
    const E=window.__EXCEL_ATTENDANCE_TRUTH_20261010;
    if(!E?.map) return;

    const table=document.querySelector('#weeklyAttSheet table');
    if(!table) return;

    const selectedMonth=String(document.getElementById('weeklyAttHijriMonthSelect')?.value||'');
    const monthByDate=new Map((E.dates||[]).map(d=>[d,hijriMonthKey(d)]));
    const VACATION_WEEK_5=vacationWeek5Dates();
    const extraById=buildExtraAttendanceMap(E,selectedMode,selectedMonth);

    const hs=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').replace(/\s+/g,' ').trim());
    const ci=hs.findIndex(x=>x.includes('السجل المدني'));
    const pi=hs.findIndex(x=>/^حاضر/.test(x));
    const ai=hs.findIndex(x=>/^غائب/.test(x));
    const coi=hs.findIndex(x=>x.includes('أيام محسوبة'));
    const ri=hs.findIndex(x=>x.includes('نسبة الحضور'));
    const gi=hs.findIndex(x=>x.includes('غياب الشهر')||x.includes('الغياب حتى الآن'));
    if(ci<0||pi<0||ai<0) return;

    let totalP=0,totalA=0,studentRows=0;
    for(const tr of table.querySelectorAll('tbody tr')){
      const td=[...tr.children];
      if(!td[ci]) continue;
      const id=String(td[ci].textContent||'').replace(/\D/g,'');
      if(!id) continue;
      const mask=E.map.get(id);

      const byDate=new Map();
      (E.dates||[]).forEach((d,i)=>{
        if(VACATION_WEEK_5.has(d)) return;
        const bit=1<<i;
        byDate.set(d,(mask && (mask[0]&bit))?'present':'absent');
      });

      const extra=extraById.get(id);
      if(extra) extra.forEach((v,d)=>byDate.set(d,v));

      // التحضير الآلي ليوم الخميس: إذا حضر الطالب يومًا واحدًا على الأقل من الأحد إلى الأربعاء
      // في نفس الأسبوع، يُحتسب الخميس حاضرًا. الأسبوع الخامس إجازة ولا يدخل.
      try{
        for(const week of Object.keys(window.WEEKLY_FIXED_HIJRI_WEEKS||{})){
          if(String(week)==='5') continue;
          const wd=typeof weeklyAttFixedWeekGregorianDates==='function'?weeklyAttFixedWeekGregorianDates(week):[];
          if(!wd||wd.length!==5) continue;
          const thu=String(wd[4]);
          if(wd.slice(0,4).some(d=>byDate.get(String(d))==='present')) byDate.set(thu,'present');
        }
      }catch(e){}

      let present=0,absent=0;
      byDate.forEach((v,d)=>{
        if(VACATION_WEEK_5.has(String(d))) return;
        if(selectedMode==='monthly'&&selectedMonth&&hijriMonthKey(String(d))!==selectedMonth) return;
        if(v==='present') present++;
        else if(v==='absent') absent++;
      });

      const counted=present+absent;
      const rate=counted?Math.round(present/counted*100):0;
      const set=(idx,val)=>{
        if(idx<0||!td[idx]) return;
        const target=td[idx].querySelector('b')||td[idx];
        if(target.textContent!==String(val)) target.textContent=String(val);
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
  }

  function schedule(){
    if(state.scheduled) return;
    state.scheduled=true;
    requestAnimationFrame(()=>setTimeout(run,20));
  }

  function wrapRenderer(){
    if(state.wrapped || typeof window.renderWeeklyAttendanceReport!=='function') return;
    const original=window.renderWeeklyAttendanceReport;
    window.renderWeeklyAttendanceReport=function(){
      const out=original.apply(this,arguments);
      schedule();
      return out;
    };
    state.wrapped=true;
  }

  function observeBody(){
    const body=document.getElementById('weeklyAttBody');
    if(!body||body===state.observedBody) return;
    state.observer?.disconnect();
    state.observer=new MutationObserver(schedule);
    state.observer.observe(body,{childList:true});
    state.observedBody=body;
  }

  function boot(){
    wrapRenderer();
    observeBody();
    const ids=['weeklyAttWeek','weeklyAttHijriMonthSelect','weeklyAttGrade','weeklyAttClass','weeklyAttStudentSearch','weeklyAttStudentSelect'];
    ids.forEach(id=>{
      const el=document.getElementById(id);
      if(el&&!el.dataset.exactTotalsHook){
        el.dataset.exactTotalsHook='1';
        el.addEventListener('change',schedule);
        if(id==='weeklyAttStudentSearch') el.addEventListener('input',schedule);
      }
    });
    schedule();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  setTimeout(boot,300);
})();

/* VACATION_WEEK_5: week 5 excluded globally from attendance totals. */
