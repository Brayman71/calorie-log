/* Progress screen: weigh-ins, a smoothed trend line (daily water-weight swings fade out), and calorie history. */
window.CL = window.CL || {};
(function(){
const U=CL.util, I=CL.ui, esc=U.esc, icon=I.icon, $=I.$, St=CL.store;

function niceStep(range){
  const raw=range/4, pow=10**Math.floor(Math.log10(raw)), n=raw/pow;
  return (n<=1? 1 : n<=2? 2 : n<=2.5? 2.5 : n<=5? 5 : 10)*pow;
}

function weightChart(tr, goalKg){
  const W=360, H=210, L=38, R=10, T=14, B=24;
  const pts=tr.slice(-120);
  if (!pts.length) return '<svg class="chart" viewBox="0 0 '+W+' '+H+'"><text class="ax" x="'+(W/2)+'" y="'+(H/2)+'" text-anchor="middle">Log a weigh-in to start your chart</text></svg>';
  const t0=U.parseDay(pts[0].date).getTime(), t1=Math.max(U.parseDay(pts[pts.length-1].date).getTime(), t0+14*864e5);
  const raw=pts.map(p=>St.toDisp(p.kg)), trd=pts.map(p=>St.toDisp(p.trend)), gv=goalKg? St.toDisp(goalKg) : null;
  let lo=Math.min(...raw, ...trd), hi=Math.max(...raw, ...trd);
  if (gv!=null && gv>lo-(hi-lo)*1.5) { lo=Math.min(lo, gv); hi=Math.max(hi, gv); }
  const step=niceStep(Math.max(hi-lo, 4));
  lo=Math.floor((lo-step*0.3)/step)*step; hi=Math.ceil((hi+step*0.3)/step)*step;
  const x=t=>L+(W-L-R)*(t-t0)/(t1-t0), y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  let out="";
  for (let v=lo; v<=hi+1e-9; v+=step) out+='<line class="grid-l" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="ax" x="'+(L-8)+'" y="'+(y(v)+4)+'" text-anchor="end">'+U.g1(v)+'</text>';
  if (gv!=null && gv>=lo && gv<=hi) out+='<line class="goal-l" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(gv)+'" y2="'+y(gv)+'"/>';
  const xs=pts.map(p=>x(U.parseDay(p.date).getTime()));
  pts.forEach((p,i)=>{ out+='<circle class="raw" cx="'+xs[i]+'" cy="'+y(raw[i])+'" r="3"><title>'+esc(U.shortDate(p.date))+': '+U.g1(raw[i])+' '+St.wUnit()+'</title></circle>'; });
  if (pts.length>1) out+='<path class="tr" d="M'+pts.map((p,i)=>xs[i].toFixed(1)+','+y(trd[i]).toFixed(1)).join(" L")+'"/>';
  const lx=xs[xs.length-1], ly=y(trd[trd.length-1]);
  out+='<text class="lastv" x="'+Math.min(lx, W-R)+'" y="'+(ly-12)+'" text-anchor="'+(lx>W-40? "end" : lx<L+24? "start" : "middle")+'">'+U.g1(trd[trd.length-1])+'</text>';
  out+='<text class="ax" x="'+L+'" y="'+(H-6)+'">'+esc(U.shortDate(pts[0].date))+'</text><text class="ax" x="'+(W-R)+'" y="'+(H-6)+'" text-anchor="end">'+esc(U.shortDate(U.ymd(new Date(t1))))+'</text>';
  return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Weight chart">'+out+'</svg>';
}

function calorieChart(goal){
  const W=360, H=140, L=38, R=10, T=8, B=20, n=28, today=U.today();
  const days=[]; for (let i=n-1;i>=0;i--){ const d=U.addDays(today,-i); days.push({d, t:St.dayTotals(d).kcal, logged:St.peekDay(d).entries.length>0}); }
  const max=Math.max(goal*1.4, ...days.map(x=>x.t));
  const bw=(W-L-R)/n, y=v=>T+(H-T-B)*(1-v/max);
  let out='<line class="grid-l" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(0)+'" y2="'+y(0)+'"/>';
  out+='<line class="goal-l" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(goal)+'" y2="'+y(goal)+'"/><text class="ax" x="'+(L-6)+'" y="'+(y(goal)+4)+'" text-anchor="end">'+U.fmt(goal)+'</text>';
  days.forEach((x,i)=>{
    const h=x.logged? Math.max(2, y(0)-y(x.t)) : 4, top=y(0)-h;
    out+='<rect class="cb'+(!x.logged? " none" : x.t>goal*1.1? " over" : "")+'" x="'+(L+i*bw+2)+'" y="'+top+'" width="'+(bw-4)+'" height="'+h+'" rx="3"><title>'+esc(U.shortDate(x.d))+': '+(x.logged? U.fmt(x.t)+' kcal' : 'not logged')+'</title></rect>';
  });
  out+='<text class="ax" x="'+L+'" y="'+(H-4)+'">'+esc(U.shortDate(days[0].d))+'</text><text class="ax" x="'+(W-R)+'" y="'+(H-4)+'" text-anchor="end">Today</text>';
  const logged=days.filter(x=>x.logged), last7=days.slice(-7).filter(x=>x.logged);
  return {svg:'<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Calories over the last 4 weeks">'+out+'</svg>',
    avg:logged.length? logged.reduce((a,x)=>a+x.t,0)/logged.length : null, avg7:last7.length? last7.reduce((a,x)=>a+x.t,0)/last7.length : null, nLogged:logged.length};
}

function render(){
  const el=$("screen-progress"), S=St.S, unit=St.wUnit(), p=CL.math.currentPlan(), G=CL.math.goals();
  const tr=CL.math.trend(S.weights), first=tr[0], last=tr[tr.length-1];
  const goalKg=(p&&p.goalKg) || (S.health&&S.health.goalKg) || null;
  const rate=CL.math.trendPerWeek(S.weights);
  const tiles=[];
  tiles.push(["Trend weight", last? St.wFmt(last.trend)+" "+unit : "—", last? "Scale said "+St.wFmt(last.kg)+" on "+U.shortDate(last.date) : "No weigh-ins yet"]);
  const change=first&&last? last.trend-first.kg : null;
  tiles.push(["Since start", change==null? "—" : (Math.abs(St.toDisp(change))<0.05? "" : change<0? "−" : "+")+U.g1(Math.abs(St.toDisp(change)))+" "+unit, first? "Started "+St.wFmt(first.kg)+" on "+U.shortDate(first.date) : "", change!=null && change<-0.2]);
  tiles.push(["Per week", rate==null? "—" : (rate<=0? "−" : "+")+U.g1(Math.abs(St.toDisp(rate)))+" "+unit, rate==null? "Needs about a week of weigh-ins" : "Trend over the last 3 weeks", rate!=null && rate<0]);
  let eta="—", etaSub=goalKg? "Goal "+St.wFmt(goalKg)+" "+unit : "Set a goal in Me";
  if (goalKg && last && last.trend>goalKg){
    const r = rate!=null && rate<-0.05? -rate : (p && p.kgPerWeek>0.02? p.kgPerWeek : null);
    if (r){ const d=new Date(); d.setDate(d.getDate()+Math.round((last.trend-goalKg)/r*7)); eta=d.toLocaleDateString(undefined,{month:"short", year:"numeric"}); etaSub=U.g1(St.toDisp(last.trend-goalKg))+" "+unit+" to go"+(rate!=null && rate<-0.05? " at your current trend" : " at your plan's pace"); }
  } else if (goalKg && last && last.trend<=goalKg){ eta="Reached"; etaSub="You hit your goal"; }
  tiles.push(["Goal date", eta, etaSub]);

  const C=calorieChart(G.goal);
  const logged14=I.loggedDaysIn(14);
  let x='<header class="screenhead"><div><div class="eyebrow">Watch the trend, not the scale</div><h1>Progress</h1></div></header>';
  x+='<section class="card"><div class="cardhead"><h2>Weigh in</h2><span class="hint">Same time each morning works best</span></div>'+
    '<form class="row" id="wForm" style="flex-wrap:nowrap"><input type="number" id="wVal" inputmode="decimal" step="0.1" placeholder="Weight ('+unit+')" aria-label="Weight in '+unit+'" style="flex:1.2">'+
    '<input type="date" id="wDate" value="'+U.today()+'" max="'+U.today()+'" aria-label="Date" style="flex:1"><button class="btn primary" type="submit">Save</button></form></section>';
  x+='<div class="tiles">'+tiles.map(([k,v,s,good])=>'<div class="tile"><div class="k">'+k+'</div><div class="v num'+(good? " good" : "")+'">'+esc(v)+'</div><div class="s">'+esc(s||"")+'</div></div>').join("")+'</div>';
  x+='<section class="card"><div class="cardhead"><h2>Weight</h2><span class="hint">'+tr.length+(tr.length===1? " weigh-in" : " weigh-ins")+'</span></div>'+weightChart(tr, goalKg)+
    '<div class="legend" style="margin-top:6px"><span><i style="background:var(--accent);height:3px"></i>Trend</span><span><i style="background:var(--muted);height:8px;width:8px;border-radius:50%"></i>Scale</span>'+(goalKg? '<span><i style="background:var(--accent);opacity:.6"></i>Goal</span>' : "")+'</div>'+
    '<p class="fine">Your weight can swing 1–4 '+unit+' a day from water, salt and food in your stomach. The trend line smooths that out, so trust it more than any single weigh-in.</p></section>';
  x+='<section class="card"><div class="cardhead"><h2>Calories, last 4 weeks</h2></div>'+C.svg+
    '<p class="hint" style="margin-top:8px">'+(C.avg==null? "Log food to see your history." : "Average on logged days: <b>"+U.fmt(C.avg)+" kcal</b>"+(C.avg7!=null? " (last 7 days: "+U.fmt(C.avg7)+")" : "")+". You logged "+logged14+" of the last 14 days.")+'</p></section>';
  const list=S.weights.slice(-12).reverse();
  if (list.length) x+='<section class="card"><h2 style="margin-bottom:6px">Recent weigh-ins</h2><ul class="wlist">'+list.map(w=>'<li><span>'+esc(U.shortDate(w.date,{weekday:"short", month:"short", day:"numeric"}))+'</span><b class="num">'+St.wFmt(w.kg)+' '+unit+'</b><button type="button" class="iconbtn ghost" data-wdel="'+w.date+'" aria-label="Delete weigh-in from '+esc(U.shortDate(w.date))+'">'+icon("x")+'</button></li>').join("")+'</ul></section>';
  el.innerHTML=x;
}

function onSubmit(e){
  if (e.target.id!=="wForm") return;
  e.preventDefault();
  const v=U.num($("wVal").value), date=$("wDate").value||U.today();
  const kg=St.fromDisp(v);
  if (!(kg>=30 && kg<=320)){ $("wVal").focus(); I.toast("Enter your weight in "+St.wUnit()+"."); return; }
  St.logWeight(date>U.today()? U.today() : date, kg);
  if (CL.store.S.health) CL.store.S.health.weightKg=CL.store.latestKg();
  St.changed();
  I.toast("Saved "+U.g1(v)+" "+St.wUnit());
}
function onClick(e){
  const b=e.target.closest("[data-wdel]"); if (!b) return;
  const S=St.S, date=b.dataset.wdel, gone=S.weights.find(w=>w.date===date);
  S.weights=S.weights.filter(w=>w.date!==date); St.changed();
  I.toast("Weigh-in deleted", ()=>{ St.logWeight(gone.date, gone.kg); St.changed(); });
}

CL.progress={render, onSubmit, onClick};
})();
