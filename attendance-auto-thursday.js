/* Auto-prepare Thursday, optimized: one cached attendance index instead of rescanning all rows per cell. */
(function(){
  const cache={stamp:'',studentById:new Map(),presentByIdDate:new Set(),thursdayWeekByDate:new Map(),weekDates:new Map()};

  function currentStamp(){
    let students=0,rows=0;
    try{students=(typeof getStudents==='function'?(getStudents()||[]):[]).length}catch(e){}
    try{rows=(typeof getAttendanceLog==='function'?(getAttendanceLog()||[]):[]).length}catch(e){}
    return students+'|'+rows;
  }

  function rebuild(){
    const stamp=currentStamp();
    if(cache.stamp===stamp && cache.thursdayWeekByDate.size) return;
    cache.stamp=stamp;
    cache.studentById=new Map();
    cache.presentByIdDate=new Set();
    cache.thursdayWeekByDate=new Map();
    cache.weekDates=new Map();

    try{
      for(const s of (typeof getStudents==='function'?(getStudents()||[]):[])){
        cache.studentById.set(String(s?.idno||''),s);
      }
    }catch(e){}

    try{
      for(const r of (typeof getAttendanceLog==='function'?(getAttendanceLog()||[]):[])){
        if(r?.status!=='present' && r?.status!=='late') continue;
        const id=String(r?.idno||''), d=String(r?.date||'');
        if(id&&d) cache.presentByIdDate.add(id+'|'+d);
      }
    }catch(e){}

    try{
      for(let n=1;n<=19;n++){
        const week=String(n);
        if(week==='5') continue;
        const dates=typeof weeklyAttFixedWeekGregorianDates==='function'?weeklyAttFixedWeekGregorianDates(week):[];
        if(dates?.length===5){
          cache.weekDates.set(week,[...dates]);
          cache.thursdayWeekByDate.set(String(dates[4]),week);
        }
      }
    }catch(e){}
  }

  function basicPresent(student,dateKey,ctx){
    const id=String(student?.idno||'');
    const d=String(dateKey||'');
    if(!id||!d) return false;

    try{
      const excel=window.__EXCEL_ATTENDANCE_TRUTH_20261010?.status?.(student,d);
      if(excel==='present') return true;
    }catch(e){}

    try{
      const rec=ctx?.statusByIdDate?.get(id+'|'+d);
      if(rec?.present||rec?.late) return true;
    }catch(e){}

    rebuild();
    return cache.presentByIdDate.has(id+'|'+d);
  }

  function autoThursday(student,dateKey,ctx){
    rebuild();
    const week=cache.thursdayWeekByDate.get(String(dateKey||''));
    if(!week) return false;
    const dates=cache.weekDates.get(week);
    if(!dates) return false;
    for(let i=0;i<4;i++){
      if(basicPresent(student,dates[i],ctx)) return true;
    }
    return false;
  }

  function findStudent(idno){
    rebuild();
    return cache.studentById.get(String(idno||''))||null;
  }

  function invalidate(){
    cache.stamp='';
    try{ if(typeof invalidateWeeklyAttBulkStats==='function') invalidateWeeklyAttBulkStats(); }catch(e){}
  }

  function install(){
    if(window.__AUTO_THURSDAY_OPTIMIZED__) return;
    window.__AUTO_THURSDAY_OPTIMIZED__=true;

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
        const student=findStudent(idno);
        if(student && autoThursday(student,dateKey,null)){
          return {mark:'✓',cls:'present-mark',label:'حاضر آليًا يوم الخميس لوجود حضور من الأحد إلى الأربعاء'};
        }
        return originalStatus.apply(this,arguments);
      };
    }

    if(typeof window.weeklyAttIsAbsentOnDate==='function'){
      const originalAbsent=window.weeklyAttIsAbsentOnDate;
      window.weeklyAttIsAbsentOnDate=function(idno,dateKey){
        const student=findStudent(idno);
        if(student && autoThursday(student,dateKey,null)) return false;
        return originalAbsent.apply(this,arguments);
      };
    }

    ['storage','attendance-updated'].forEach(evt=>window.addEventListener(evt,invalidate));
    invalidate();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  setTimeout(install,250);
})();