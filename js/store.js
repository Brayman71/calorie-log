/* Everything the app remembers lives in one object, saved to this phone's storage.
   Nothing leaves the phone except food lookups (Open Food Facts / USDA) and, if you add a key, Claude requests. */
window.CL = window.CL || {};
(function(){
const KEY="calorie-log-data-v1", KEY_API="calorie-log-anthropic-key";
const U=CL.util;

const DEFAULTS = () => ({
  version:1,
  profile:{goalsMode:"plan", goal:2000, protein:125, carbs:225, fat:65, waterGoal:8, recents:[], favorites:[]},
  health:null,
  weights:[],          // [{date, kg}]
  waist:[],            // [{date, cm}]
  days:{},             // date -> {entries:[], water:0}
  plans:{},            // weekStart -> plan
  myFoods:[],          // scanned, searched and custom foods
  meals:[],            // saved meals: {id, name, items:[...]}
  createdAt:Date.now()
});

let S = DEFAULTS();
let saveTimer=null;
const listeners=new Set();

function load(){
  try {
    const raw=localStorage.getItem(KEY);
    if (raw){ const d=JSON.parse(raw); S=Object.assign(DEFAULTS(), d); S.profile=Object.assign(DEFAULTS().profile, d.profile||{}); }
  } catch(e){ console.warn("Could not read saved data", e); }
  return S;
}
function saveNow(){
  clearTimeout(saveTimer); saveTimer=null;
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch(e){ console.error(e); CL.ui && CL.ui.toast("Your phone's storage is full. Export a backup and delete old data."); return false; }
}
/* Call after any change. Saves shortly after and re-renders listeners. */
function changed(){
  clearTimeout(saveTimer); saveTimer=setTimeout(saveNow, 250);
  listeners.forEach(fn=>{ try { fn(); } catch(e){ console.error(e); } });
}
function onChange(fn){ listeners.add(fn); }

function day(date){
  if (!S.days[date]) S.days[date]={entries:[], water:0};
  const d=S.days[date]; if (!Array.isArray(d.entries)) d.entries=[]; if (!d.water) d.water=0;
  return d;
}
function peekDay(date){ return S.days[date] || {entries:[], water:0}; }
function dayTotals(date){
  const t={kcal:0, protein:0, carbs:0, fat:0, fiber:0};
  for (const e of peekDay(date).entries){ t.kcal+=e.kcal||0; t.protein+=e.protein||0; t.carbs+=e.carbs||0; t.fat+=e.fat||0; t.fiber+=e.fiber||0; }
  return t;
}
function pruneEmptyDay(date){ const d=S.days[date]; if (d && !d.entries.length && !d.water) delete S.days[date]; }

function latestKg(){ return S.weights.length? S.weights[S.weights.length-1].kg : (S.health && S.health.weightKg) || null; }
function logWeight(date, kg){
  S.weights=S.weights.filter(w=>w.date!==date);
  S.weights.push({date, kg:Math.round(kg*100)/100});
  S.weights.sort((a,b)=>a.date<b.date? -1 : 1);
}

/* Units follow the answer in My plan; default to lb / ft. */
function isUS(){ return !S.health || S.health.units!=="metric"; }
function wUnit(){ return isUS()? "lb" : "kg"; }
function toDisp(kg){ return isUS()? kg/U.KG_PER_LB : kg; }
function fromDisp(v){ return isUS()? v*U.KG_PER_LB : v; }
function wFmt(kg){ return U.g1(toDisp(kg)); }

function getApiKey(){ try { return localStorage.getItem(KEY_API)||""; } catch(e){ return ""; } }
function setApiKey(k){ try { if (k) localStorage.setItem(KEY_API, k); else localStorage.removeItem(KEY_API); } catch(e){} }

function exportJSON(){ return JSON.stringify(Object.assign({exportedAt:new Date().toISOString(), app:"calorie-log"}, S), null, 1); }

/* Accepts this app's backup, or the export from the Claude version of the app. */
function importJSON(text){
  const d=JSON.parse(text);
  if (!d || typeof d!=="object") throw new Error("That file isn't a Calorie Log backup.");
  if (d.app==="calorie-log" || d.days || d.profile){
    const next=Object.assign(DEFAULTS(), d);
    next.profile=Object.assign(DEFAULTS().profile, d.profile||{});
    // Claude-version exports store weights as {entries:[]} and days as {date:{date, entries}}
    if (d.weights && !Array.isArray(d.weights) && Array.isArray(d.weights.entries)) next.weights=d.weights.entries;
    for (const k in next.days){ const v=next.days[k]; next.days[k]={entries:Array.isArray(v.entries)? v.entries : [], water:v.water||0}; }
    delete next.exportedAt; delete next.app;
    S=next; saveNow(); changed();
    return true;
  }
  throw new Error("That file isn't a Calorie Log backup.");
}
function reset(){ S=DEFAULTS(); saveNow(); changed(); }

async function requestPersistence(){
  try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch(e){}
}

CL.store = {load, saveNow, changed, onChange, day, peekDay, dayTotals, pruneEmptyDay, latestKg, logWeight,
  isUS, wUnit, toDisp, fromDisp, wFmt, getApiKey, setApiKey, exportJSON, importJSON, reset, requestPersistence,
  get S(){ return S; }};
})();
