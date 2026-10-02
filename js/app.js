/* Starts the app: loads saved data, wires the tab bar and screens, and registers the offline service worker. */
window.CL = window.CL || {};
(function(){
const U=CL.util, I=CL.ui, $=I.$;
const SCREENS={today:CL.today, plan:CL.planUI, progress:CL.progress, me:CL.me};

CL.state={tab:"today", date:U.today(), week:U.weekStart(U.today()), planDay:U.dayIdx(U.today()), planView:"meals"};

function setTheme(t){
  try { if (t==="system") localStorage.removeItem("calorie-log-theme"); else localStorage.setItem("calorie-log-theme", t); } catch(e){}
  applyTheme();
}
function applyTheme(){
  let t="system"; try { t=localStorage.getItem("calorie-log-theme")||"system"; } catch(e){}
  if (t==="system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
  const dark = t==="dark" || (t==="system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark? "#0E1210" : "#F1F4F0");
}

function setTab(t){
  if (!SCREENS[t]) return;
  CL.state.tab=t;
  for (const k of Object.keys(SCREENS)) $("screen-"+k).hidden = k!==t;
  document.querySelectorAll(".tabbar [data-tab]").forEach(b=>{ if (b.dataset.tab===t) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  try { sessionStorage.setItem("calorie-log-tab", t); } catch(e){}
  render();
  window.scrollTo(0,0);
}
function render(){
  const s=SCREENS[CL.state.tab];
  try { s.render(); } catch(e){ console.error(e); }
}
function renderAll(){ render(); }

/* Keep "today" correct if the app stays open past midnight. */
let lastDay=U.today(), lastPart=dayPart();
function dayPart(){ const h=new Date().getHours(); return [4,5,11,12,17,19].filter(x=>h>=x).length; }   // greeting and check-in boundaries
function checkDayRollover(){
  const t=U.today(), p=dayPart();
  if (t!==lastDay){ if (CL.state.date===lastDay) CL.state.date=t; if (CL.state.week===U.weekStart(lastDay)) CL.state.week=U.weekStart(t); lastDay=t; lastPart=p; render(); return; }
  if (p!==lastPart){ lastPart=p; const a=document.activeElement; if (CL.state.tab==="today" && !(a && /INPUT|TEXTAREA/.test(a.tagName))) render(); }
}

function wire(){
  document.querySelector(".tabbar").addEventListener("click", e=>{ const b=e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
  $("fab").onclick=()=>CL.add.open({date:CL.state.tab==="today"? CL.state.date : U.today()});
  $("screen-today").addEventListener("click", CL.today.onClick);
  $("screen-today").addEventListener("submit", CL.today.onSubmit);
  $("screen-plan").addEventListener("click", CL.planUI.onClick);
  $("screen-plan").addEventListener("change", CL.planUI.onChange);
  $("screen-progress").addEventListener("click", CL.progress.onClick);
  $("screen-progress").addEventListener("submit", CL.progress.onSubmit);
  const me=$("screen-me");
  me.addEventListener("input", CL.me.onInput);
  me.addEventListener("change", e=>{ CL.me.onChange(e); if (e.target.closest("#healthForm")) CL.me.onInput(e); });
  me.addEventListener("submit", CL.me.onSubmit);
  me.addEventListener("click", CL.me.onClick);
  $("importInput").addEventListener("change", CL.me.onChange);

  $("scrim").onclick=I.closeSheet;
  $("sheetClose").onclick=I.closeSheet;
  $("toastUndo").onclick=()=>{ const fn=I.undo; I.hideToast(); if (fn) fn(); };
  document.addEventListener("keydown", e=>{
    if (e.key!=="Escape") return;
    if (!$("scanner").hidden) CL.add.closeScanner(); else if (I.sheetOpen()) I.closeSheet();
  });
  document.addEventListener("visibilitychange", ()=>{ if (!document.hidden) checkDayRollover(); });
  setInterval(checkDayRollover, 60000);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  CL.add.init();
}

function boot(){
  applyTheme();
  CL.store.load();
  CL.store.onChange(render);
  wire();
  let t="today"; try { t=sessionStorage.getItem("calorie-log-tab")||"today"; } catch(e){}
  setTab(SCREENS[t]? t : "today");
  CL.store.requestPersistence();
  if ("serviceWorker" in navigator && location.protocol!=="file:"){
    navigator.serviceWorker.register("sw.js").catch(e=>console.warn("Offline mode unavailable", e));
  }
  // Save right away if the app is backgrounded (iOS may close it without warning).
  document.addEventListener("visibilitychange", ()=>{ if (document.hidden) CL.store.saveNow(); });
  window.addEventListener("pagehide", ()=>CL.store.saveNow());
}

CL.app={setTab, render, renderAll, setTheme};
boot();
})();
