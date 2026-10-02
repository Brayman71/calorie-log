/* Small shared helpers: dates, numbers, escaping, units. */
window.CL = window.CL || {};
(function(){
const KG_PER_LB = 0.45359237;

function ymd(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function parseDay(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addDays(s,n){ const d=parseDay(s); d.setDate(d.getDate()+n); return ymd(d); }
function today(){ return ymd(new Date()); }
function dayIdx(s){ return (parseDay(s).getDay()+6)%7; }          // Monday = 0
function weekStart(s){ return addDays(s, -dayIdx(s)); }
function shortDate(s, opts){ return parseDay(s).toLocaleDateString(undefined, opts||{month:"short", day:"numeric"}); }

function fmt(n){ return Math.round(n||0).toLocaleString(); }
function g1(n){ const r=Math.round((n||0)*10)/10; return Number.isInteger(r)? String(r) : r.toFixed(1); }
function esc(s){ return String(s==null? "" : s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function num(v){ const n=parseFloat(v); return Number.isFinite(n)? n : NaN; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function round5(n){ return Math.round(n/5)*5; }
function round10(n){ return Math.round(n/10)*10; }
function clampNum(v,lo,hi){ const n=num(v); return Number.isFinite(n)? Math.min(hi,Math.max(lo,n)) : 0; }
function str(v,max){ return v==null? "" : String(v).slice(0,max); }
function arr(v,n,max){ return Array.isArray(v)? v.filter(x=>x!=null && String(x).trim()).slice(0,n).map(x=>String(x).slice(0,max)) : []; }

/* Friendly fractions for recipe amounts: 0.25 → ¼, 1.5 → 1½ */
function frac(q){
  if (!Number.isFinite(q)) return "";
  const whole=Math.floor(q+1e-9), rest=q-whole;
  const map=[[0,""],[0.125,"⅛"],[0.25,"¼"],[0.33,"⅓"],[0.5,"½"],[0.67,"⅔"],[0.75,"¾"],[1,""]];
  let best=map[0], diff=1;
  for (const m of map){ const dd=Math.abs(rest-m[0]); if (dd<diff){ diff=dd; best=m; } }
  let w=whole, f=best[1];
  if (best[0]===1){ w+=1; f=""; }
  if (diff>0.07) return g1(q);
  return (w? String(w) : "")+f || "0";
}

CL.util = {KG_PER_LB, ymd, parseDay, addDays, today, dayIdx, weekStart, shortDate, fmt, g1, esc, num, uid, clone, round5, round10, clampNum, str, arr, frac};
})();
