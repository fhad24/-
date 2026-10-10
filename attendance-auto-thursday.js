/* Auto-prepare Thursday: if student was present at least once Sun-Wed, Thursday is present. Week 5 vacation excluded. */
(function(){
  function weekDatesForThursday(dateKey){
    const key=String(dateKey||'');
    try{
      for(let n=1;n<=19;n++){ const week=String(n);
        if(String(week)==='5') continue;
        const dates=typeof weeklyAttFixedWeekGregorianDates==='function'?weeklyAttFixedWeekGregorianDates(week):[];
        if(dates?.length===5 && String(dates[4])===key) return dates;
      }
    }catch(e){}
    return null;
  }

  function basicPresent(student,dateKey,ctx){
    const id=String(student?.idno||'');
    if(!id) return false;
    try{
      const excel=window.__EXCEL_ATTENDANCE_TRUTH_20261010?.status?.(student,String(dateKey||''));
      if(excel==='present') return true;
    }catch(e){}
    try{
      const rec=ctx?.statusByIdDate?.get(id+'|'+String(dateKey||''));
      if(rec?.present||rec?.late) return true;
    }catch(e){}
    try{
      const rows=typeof weeklyAttScopedRows==='function'?weeklyAttScopedRows():[];
      return rows.some(r=>String(r?.idno||'')===id && String(r?.date||'')===String(dateKey||'') && (r?.status==='present'||r?.status==='late'));
    }catch(e){ return false; }
  }

  function autoThursday(student,dateKey,ctx){
    const dates=weekDatesForThursday(dateKey);
    if(!dates) return false;
    return dates.slice(0,4).some(d=>basicPresent(student,d,ctx));
  }

  function install(){
    if(window.__AUTO_THURSDAY_INSTALLED__) return;
    window.__AUTO_THURSDAY_INSTALLED__=true;

    if(typeof window.weeklyAttFastStatus==='function'){
      const originalFast=window.weeklyAttFastStatus;
      window.weeklyAttFastStatus=function(student,dateKey,ctx){
        if(autoThursday(student,dateKey,ctx)) return 'present';
        return originalFast.apply(this,arguments);
      };
    }

    if(typeof window.weeklyAttStatusForStudent==='function'){
      const originalStatus=window.weeklyAttStatusForStudent;
      window.weeklyAttStatusForStudent=function(idno,dateKey){
        let student=null;
        try{ student=(typeof getStudents==='function'?getStudents():[]).find(s=>String(s?.idno||'')===String(idno)); }catch(e){}
        if(student && autoThursday(student,dateKey,null)){
          return {mark:'✓',cls:'present-mark',label:'حاضر آليًا يوم الخميس لوجود حضور من الأحد إلى الأربعاء'};
        }
        return originalStatus.apply(this,arguments);
      };
    }

    if(typeof window.weeklyAttIsAbsentOnDate==='function'){
      const originalAbsent=window.weeklyAttIsAbsentOnDate;
      window.weeklyAttIsAbsentOnDate=function(idno,dateKey){
        let student=null;
        try{ student=(typeof getStudents==='function'?getStudents():[]).find(s=>String(s?.idno||'')===String(idno)); }catch(e){}
        if(student && autoThursday(student,dateKey,null)) return false;
        return originalAbsent.apply(this,arguments);
      };
    }

    try{ if(typeof invalidateWeeklyAttBulkStats==='function') invalidateWeeklyAttBulkStats(); }catch(e){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  setTimeout(install,300);
})();