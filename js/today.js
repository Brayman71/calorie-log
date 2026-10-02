/* Today screen: calories left, macros, weekly budget, water, today's planned meals and the food log. */
window.CL = window.CL || {};
(function(){
const U=CL.util, I=CL.ui;
const {$, icon, esc}={$:CL.ui.$, icon:CL.ui.icon, esc:U.esc};

function ring(frac, over){
  const r=36, c=2*Math.PI*r, f=Math.max(0, Math.min(1, frac));
  return '<svg class="ring'+(over? " over" : "")+'" viewBox="0 0 84 84" aria-hidden="true"><circle class="bgc" cx="42" cy="42" r="'+r+'"/>'+
    '<circle class="fg" cx="42" cy="42" r="'+r+'" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+(c*(1-f)).toFixed(1)+'" transform="rotate(-90 42 42)"/>'+
    '<text x="42" y="48" text-anchor="middle">'+Math.round(Math.max(0, frac)*100)+'%</text></svg>';
}

function macroCell(key, label, val, goal){
  const pct=goal? Math.min(100, val/goal*100) : 0;
  return '<div class="mac" data-m="'+key+'"><span class="t">'+label+'</span><span class="n num">'+Math.round(val)+(goal? '<small> / '+goal+'g</small>' : '<small>g</small>')+'</span><div class="bar"><i style="width:'+pct.toFixed(1)+'%"></i></div></div>';
}

/* Weekly budget: unspent calories from earlier days carry forward; extra ones spread out gently. */
function weekInfo(date, G){
  const wk=U.weekStart(date), today=U.today(), out={days:[], wk};
  let banked=0, eaten=0, loggedPast=0;
  for (let i=0;i<7;i++){
    const d=U.addDays(wk,i), t=CL.store.dayTotals(d).kcal, logged=CL.store.peekDay(d).entries.length>0;
    out.days.push({d, t, logged, future:d>today});
    if (d<today && logged){ banked+=G.goal-t; loggedPast++; }
    if (d<=today) eaten+=t;
  }
  const inWeek = today>=wk && today<=U.addDays(wk,6);
  out.inWeek=inWeek; out.eaten=eaten; out.loggedPast=loggedPast;
  if (inWeek){
    const left=7-U.dayIdx(today);
    out.perDay=Math.round(G.goal + banked/left);
    out.banked=banked; out.left=left;
  }
  return out;
}

function weekCard(date, G){
  const W=weekInfo(date, G), max=Math.max(G.goal*1.35, ...W.days.map(x=>x.t));
  const bars=W.days.map((x,i)=>{
    const h=Math.min(100, x.t/max*100), gl=100-G.goal/max*100, over=x.t>G.goal*1.1;
    return '<button type="button" class="d'+(x.d===date? " sel" : "")+(x.future? " future" : "")+'" data-go="'+x.d+'" aria-label="'+esc(U.shortDate(x.d,{weekday:"long"}))+': '+U.fmt(x.t)+' kcal">'+
      '<span class="col'+(over? " over" : "")+'"><i style="height:'+h.toFixed(1)+'%"></i><span class="gl" style="top:'+gl.toFixed(1)+'%"></span></span>'+
      '<span class="dn">'+CL.planner.DAYN[i].slice(0,2)+'</span></button>';
  }).join("");
  let msg="";
  if (W.inWeek && W.loggedPast){
    if (W.banked>=0) msg='You\'ve banked <b>'+U.fmt(W.banked)+' kcal</b> this week, so you have about <b>'+U.fmt(W.perDay)+'</b> a day for the rest of it.';
    else {
      const soft=Math.max(W.perDay, Math.round(G.goal*0.9));
      msg='You\'re <b>'+U.fmt(-W.banked)+' kcal</b> over for the week so far. Aiming for about <b>'+U.fmt(soft)+'</b> a day evens it out'+(soft>W.perDay? " most of the way. No need to make it all up; one big day doesn't undo your progress." : ".");
    }
  } else if (W.inWeek) msg="Days under your target bank calories for later in the week, so a big dinner on Saturday is fine.";
  else {
    const logged=W.days.filter(x=>x.logged);
    msg = logged.length? "Averaged "+U.fmt(logged.reduce((a,x)=>a+x.t,0)/logged.length)+" kcal on "+logged.length+" logged "+(logged.length===1? "day" : "days")+"." : "Nothing logged this week.";
  }
  return '<section class="card"><div class="cardhead"><h2>This week</h2><span class="hint num">'+U.fmt(W.eaten)+' / '+U.fmt(G.goal*7)+' kcal</span></div>'+
    '<div class="weekbars">'+bars+'</div><p class="hint" style="margin-top:10px">'+msg+'</p></section>';
}

function waterCard(date){
  const S=CL.store.S, n=CL.store.peekDay(date).water||0, goal=S.profile.waterGoal||8;
  const metric=!CL.store.isUS(), unit=metric? "250 ml" : "8 oz";
  let glasses="";
  for (let i=0;i<Math.max(goal, n);i++){
    glasses+='<button type="button" class="glass'+(i<n? " on" : "")+'" data-water="'+(i+1)+'" aria-label="'+(i+1)+(i===0? " glass" : " glasses")+'">'+
      '<svg viewBox="0 0 30 38"><path class="fill" d="M6 14h18l-2.2 19a2 2 0 0 1-2 1.8H10.2a2 2 0 0 1-2-1.8z"/><path class="outline" d="M3 4h24l-3 29.2a2.2 2.2 0 0 1-2.2 2H8.2a2.2 2.2 0 0 1-2.2-2z"/></svg></button>';
  }
  return '<section class="card"><div class="cardhead"><h2>Water</h2><span class="hint">'+n+' of '+goal+' glasses ('+unit+')</span></div>'+
    '<div class="water">'+glasses+'<button type="button" class="iconbtn" data-water="+1" aria-label="Add a glass">'+icon("plus")+'</button></div></section>';
}

function plannedCard(date){
  const plan=CL.store.S.plans[U.weekStart(date)];
  if (!plan) return "";
  const di=U.dayIdx(date), day=(plan.days||[])[di]; if (!day) return "";
  const entries=CL.store.peekDay(date).entries;
  const rows=CL.planner.SLOT_KEYS.map(slot=>{
    const r=CL.planner.recipeById(plan, day[slot]); if (!r) return "";
    const done=entries.some(e=>e.plan===date+":"+slot);
    return '<li>'+I.mealBadge(slot)+'<div class="grow"><div class="slot">'+I.SLOT_MEAL[slot]+'</div><div style="font-weight:600;line-height:1.25">'+esc(r.name)+'</div><div class="hint num">'+U.fmt(CL.planner.slotKcal(plan, r))+' kcal</div></div>'+
      (done? '<span class="done">'+icon("check")+'Logged</span>' : '<button type="button" class="btn small soft" data-logplan="'+slot+'">Ate it</button>')+'</li>';
  }).join("");
  if (!rows) return "";
  return '<section class="card"><div class="cardhead"><h2>On your plan</h2><button type="button" class="linkbtn" data-tabgo="plan">See recipes</button></div><ul class="planned">'+rows+'</ul></section>';
}

/* Morning and evening check-ins: the one or two things worth doing right now. Each part can be dismissed for the day. */
function nudgePart(){
  const h=new Date().getHours();
  return h>=4 && h<11? "am" : h>=19? "pm" : null;
}
function nudgeCard(date, G, T){
  const S=CL.store.S, pr=S.profile, today=U.today(), part=nudgePart();
  if (date!==today || pr.nudges===false || !part || pr.nudgeHide===today+":"+part) return "";
  const day=CL.store.peekDay(today), has=m=>day.entries.some(e=>e.meal===m);
  const rows=[];
  if (part==="am"){
    if (!S.weights.some(w=>w.date===today) && (S.weights.length || S.health)){
      rows.push('<li><div class="grow"><b>Weigh in</b><div class="hint">After the bathroom, before breakfast</div></div>'+
        '<form class="row" id="nudgeW" style="flex-wrap:nowrap"><input type="number" id="nudgeWv" inputmode="decimal" step="0.1" placeholder="'+CL.store.wUnit()+'" aria-label="Weight in '+CL.store.wUnit()+'" style="width:86px;min-height:40px;padding:8px 10px"><button class="btn small primary" type="submit">Save</button></form></li>');
    }
    if (!has("Breakfast")){
      const plan=S.plans[U.weekStart(today)], pd=plan && (plan.days||[])[U.dayIdx(today)], r=pd && CL.planner.recipeById(plan, pd.breakfast);
      rows.push('<li><div class="grow"><b>Log breakfast</b><div class="hint">'+(r? "Planned: "+esc(r.name) : "Scan it or search for it")+'</div></div>'+
        (r? '<button type="button" class="btn small soft" data-logplan="breakfast">Ate it</button>' : '<button type="button" class="btn small soft" data-nscan="Breakfast">'+icon("scan")+'Scan</button>')+
        '<button type="button" class="iconbtn" data-add="Breakfast" aria-label="Add breakfast">'+icon("plus")+'</button></li>');
    }
    if (!(day.water>0)) rows.push('<li><div class="grow"><b>Start with a glass of water</b><div class="hint">Easy first win of the day</div></div><button type="button" class="btn small soft" data-water="+1">'+icon("plus")+'1 glass</button></li>');
  } else {
    if (!day.entries.length) rows.push('<li><div class="grow"><b>Nothing logged today</b><div class="hint">A rough log beats none. Quick add takes 5 seconds.</div></div><button type="button" class="btn small soft" data-add="Dinner">Log food</button></li>');
    else if (!has("Dinner")) rows.push('<li><div class="grow"><b>Log dinner</b><div class="hint">'+(G.goal-T.kcal>0? U.fmt(G.goal-T.kcal)+" kcal left for today" : "Close out the day")+'</div></div><button type="button" class="btn small soft" data-add="Dinner">'+icon("plus")+'Dinner</button></li>');
    const left=G.goal-T.kcal;
    if (day.entries.length && has("Dinner") && left>150) rows.push('<li><div class="grow"><b>'+U.fmt(left)+' kcal left</b><div class="hint">Room for a snack if you\'re hungry. Under is fine too; it banks for the week.</div></div></li>');
  }
  if (!rows.length) return "";
  return '<section class="card nudge"><div class="cardhead"><h2>'+(part==="am"? icon("sun")+"Morning check-in" : icon("check")+"Evening check-in")+'</h2>'+
    '<button type="button" class="iconbtn ghost" data-nudgex="'+part+'" aria-label="Hide for today">'+icon("x")+'</button></div><ul class="nlist">'+rows.join("")+'</ul></section>';
}
/* Monday to Wednesday: point to last week's check-in until it's been seen. */
function reviewBanner(date){
  const S=CL.store.S, today=U.today();
  if (date!==today || U.dayIdx(today)>2) return "";
  const last=U.addDays(U.weekStart(today), -7);
  if (S.profile.reviewSeen===last) return "";
  let n=0; for (let i=0;i<7;i++) if (CL.store.peekDay(U.addDays(last,i)).entries.length) n++;
  if (!n) return "";
  return '<section class="card banner">'+icon("chart")+'<div class="grow"><b>Your weekly check-in is ready</b><p>How last week went, and one thing to try this week.</p></div><button type="button" class="btn small primary" data-review="1">See it</button></section>';
}

/* Weight milestones: every 5 lb (or 2 kg) of trend loss, plus halfway and goal. Shown once each. */
function milestone(){
  const S=CL.store.S, pr=S.profile;
  if (S.weights.length<3) return null;
  const tr=CL.math.trend(S.weights), first=tr[0].kg, now=tr[tr.length-1].trend;
  const us=CL.store.isUS(), step=us? 5*U.KG_PER_LB : 2, unit=CL.store.wUnit();
  const lost=first-now, level=Math.floor(lost/step+0.001);
  const goalKg=S.health && S.health.goalKg;
  const atGoal=goalKg && goalKg<first && now<=goalKg;
  const half=goalKg && goalKg<first-step && lost>=(first-goalKg)/2;
  const key= atGoal? "goal" : level>=1? "L"+level : null;
  const halfKey= half? "half" : null;
  const seen=pr.msSeen||[];
  if (atGoal && !seen.includes("goal") || !atGoal && level>(pr.msLevel||0)){
    if (atGoal) return {key, level, title:"You reached your goal weight", text:"Your trend weight is at "+CL.store.wFmt(now)+" "+unit+". Head to Me to switch your plan to maintaining, so the target stops cutting."};
    return {key, level, title:"Down "+U.g1(CL.store.toDisp(level*step))+" "+unit+" on your trend", text:"That's real loss, not water noise. Whatever you've been doing is working, so keep it boring and keep going."};
  }
  if (halfKey && !seen.includes(halfKey)) return {key:halfKey, level, title:"Halfway to your goal", text:"You've lost "+U.g1(CL.store.toDisp(lost))+" "+unit+" on your trend. The second half goes the same way: one day at a time."};
  return null;
}
function extraBanner(date){
  if (date!==U.today()) return "";
  const ms=milestone();
  if (ms) return '<section class="card banner cheer">'+icon("trophy")+'<div class="grow"><b>'+esc(ms.title)+'</b><p>'+esc(ms.text)+'</p></div><button type="button" class="iconbtn ghost" data-ms="'+ms.key+'" aria-label="Done">'+icon("check")+'</button></section>';
  // Backup reminder: data lives only on this phone
  const S=CL.store.S, pr=S.profile, today=U.today();
  const logged=Object.keys(S.days||{}).length;
  const due=!pr.lastBackup || U.addDays(pr.lastBackup, 30)<=today;
  if (logged>=7 && due && !(pr.backupSnooze && pr.backupSnooze>today)){
    return '<section class="card banner">'+icon("shield")+'<div class="grow"><b>Save a backup</b><p>'+(pr.lastBackup? "Your last one was "+U.shortDate(pr.lastBackup)+"." : "Your logs live only on this phone.")+' Save a copy to Files or iCloud Drive in case the phone gets lost or reset.</p>'+
      '<div class="row" style="margin-top:8px"><button type="button" class="btn small primary" data-backup="1">'+icon("share")+'Save backup</button><button type="button" class="btn small ghost" data-backupx="1">Later</button></div></div></section>';
  }
  return "";
}

function mealCard(date, meal){
  const list=CL.store.peekDay(date).entries.filter(e=>e.meal===meal);
  const kcal=list.reduce((a,e)=>a+(e.kcal||0),0);
  const rows=list.map(e=>'<li><button type="button" class="entry" data-entry="'+e.id+'"><div class="grow"><div class="nm">'+esc(e.name)+'</div><div class="sub">'+
    esc((e.servings!==1? U.frac(e.servings)+" × " : "")+(e.serving||"serving"))+' · '+I.macroText(e)+'</div></div><span class="kc num">'+U.fmt(e.kcal)+'</span></button></li>').join("");
  return '<section class="card meal"><div class="mh">'+I.mealBadge(meal)+'<div class="grow"><h2>'+meal+'</h2><span class="k num">'+(list.length? U.fmt(kcal)+' kcal' : "Nothing yet")+'</span></div>'+
    '<div class="row" style="gap:2px"><button type="button" class="iconbtn ghost" data-mealmenu="'+meal+'" aria-label="'+meal+' options">'+icon("dots")+'</button>'+
    '<button type="button" class="iconbtn ghost" data-add="'+meal+'" aria-label="Add to '+meal+'">'+icon("plus")+'</button></div></div>'+
    (rows? '<ul class="entries">'+rows+'</ul>' : "")+'</section>';
}

function render(){
  const el=$("screen-today"), st=CL.state, date=st.date, today=U.today();
  const T=CL.store.dayTotals(date), G=CL.math.goals();
  const left=G.goal-T.kcal, over=left<0, flexOver=over && -left<=G.goal*0.1;   // a little over is just a normal day
  const title= date===today? "Today" : date===U.addDays(today,-1)? "Yesterday" : U.shortDate(date,{weekday:"short", month:"short", day:"numeric"});
  const sk=I.streak();
  const hr=new Date().getHours(), hello=hr<5? "Up late" : hr<12? "Good morning" : hr<17? "Good afternoon" : "Good evening";
  const eyebrow= date===today? hello : U.shortDate(date,{weekday:"long", month:"long", day:"numeric"});
  let x='<header class="screenhead"><div><div class="eyebrow">'+esc(eyebrow)+(sk>=2? ' · <span class="streak" title="Days logged in a row. One missed day a week doesn\'t break it.">'+icon("flame")+sk+'-day streak</span>' : "")+'</div>'+
    '<h1><button type="button" data-go="'+today+'" aria-label="Go to today">'+esc(title)+'</button></h1></div>'+
    '<div class="daynav"><button type="button" class="iconbtn" data-day="-1" aria-label="Previous day">'+icon("left")+'</button>'+
    '<button type="button" class="iconbtn" data-day="1" aria-label="Next day"'+(date>=today? " disabled" : "")+'>'+icon("right")+'</button></div></header>';

  if (!CL.store.S.health){
    x+='<section class="card banner"><div class="grow"><b>Set up your plan</b><p>Answer a few questions and the app works out a calorie target that doesn\'t feel like a punishment.</p></div><button type="button" class="btn primary small" data-tabgo="me">Start</button></section>';
  }

  const rb=reviewBanner(date);
  x+= rb || extraBanner(date);
  x+=nudgeCard(date, G, T);

  // Calories left
  let bigVal, bigLbl;
  if (!over){ bigVal=U.fmt(left); bigLbl="kcal left"; }
  else if (flexOver){ bigVal=U.fmt(-left); bigLbl="kcal over. Totally fine."; }
  else { bigVal=U.fmt(-left); bigLbl="kcal over today. The week evens it out."; }
  x+='<section class="card summary hero'+(over && !flexOver? " over" : "")+'"><div class="big'+(over && !flexOver? " over" : "")+'"><div><div class="v num">'+bigVal+'</div><div class="l">'+bigLbl+'</div></div>'+ring(T.kcal/G.goal, over && !flexOver)+'</div>'+
    '<div class="eq num"><div><b>'+U.fmt(G.goal)+'</b><span>Target</span></div><div><b>'+U.fmt(T.kcal)+'</b><span>Eaten</span></div><div><b>'+(over? "+"+U.fmt(-left) : U.fmt(left))+'</b><span>'+(over? "Over" : "Left")+'</span></div></div>'+
    '<div class="macros">'+macroCell("protein","Protein",T.protein,G.protein)+macroCell("carbs","Carbs",T.carbs,G.carbs)+macroCell("fat","Fat",T.fat,G.fat)+macroCell("fiber","Fiber",T.fiber,G.fiber)+'</div>'+
    (G.flex? '<p class="flexnote">'+icon("gift")+'Includes a '+U.fmt(G.flex)+' kcal treat allowance. Spend it on anything.</p>' : "")+'</section>';

  // Same as yesterday?
  const yd=U.addDays(date,-1), ydN=CL.store.peekDay(yd).entries.length;
  if (!CL.store.peekDay(date).entries.length && ydN){
    x+='<section class="card banner"><div class="grow"><b>Same as yesterday?</b><p>Copy all '+ydN+' items from '+(date===today? "yesterday" : U.shortDate(yd))+', then remove what you didn\'t have.</p></div><button type="button" class="btn small" data-copyday="1">'+icon("copy")+'Copy</button></section>';
  }

  x+=plannedCard(date);
  x+=I.MEALS.map(m=>mealCard(date, m)).join("");
  x+=waterCard(date);
  x+=weekCard(date, G);
  el.innerHTML=x;
}

/* The weigh-in box in the morning check-in */
function onSubmit(e){
  if (e.target.id!=="nudgeW") return;
  e.preventDefault();
  const v=U.num($("nudgeWv").value), kg=CL.store.fromDisp(v);
  if (!(kg>=30 && kg<=320)){ $("nudgeWv").focus(); I.toast("Enter your weight in "+CL.store.wUnit()+"."); return; }
  CL.store.logWeight(U.today(), kg);
  if (CL.store.S.health) CL.store.S.health.weightKg=CL.store.latestKg();
  CL.store.changed();
  I.toast("Saved "+U.g1(v)+" "+CL.store.wUnit());
}

/* Clicks on the Today screen */
function onClick(ev){
  const b=ev.target.closest("button"); if (!b) return;
  const st=CL.state, date=st.date;
  if (b.dataset.day){ const d=U.addDays(date, +b.dataset.day); if (d<=U.today()){ st.date=d; render(); } return; }
  if (b.dataset.go){ st.date=b.dataset.go>U.today()? U.today() : b.dataset.go; render(); return; }
  if (b.dataset.add){ CL.add.open({meal:b.dataset.add, date}); return; }
  if (b.dataset.entry){ CL.add.editEntry(date, b.dataset.entry); return; }
  if (b.dataset.mealmenu){ mealMenu(date, b.dataset.mealmenu); return; }
  if (b.dataset.copyday){ I.copyEntries(U.addDays(date,-1), date); return; }
  if (b.dataset.tabgo){ CL.app.setTab(b.dataset.tabgo); return; }
  if (b.dataset.logplan){ CL.planUI.logSlot(date, b.dataset.logplan); return; }
  if (b.dataset.nscan){ CL.add.open({meal:b.dataset.nscan, date}); CL.add.openScanner(); return; }
  if (b.dataset.nudgex){ CL.store.S.profile.nudgeHide=U.today()+":"+b.dataset.nudgex; CL.store.changed(); return; }
  if (b.dataset.ms){ const pr=CL.store.S.profile, m=milestone(); if (b.dataset.ms==="goal" || b.dataset.ms==="half") pr.msSeen=[...(pr.msSeen||[]), b.dataset.ms]; pr.msLevel=Math.max(pr.msLevel||0, m? m.level : 0); CL.store.changed(); return; }
  if (b.dataset.backup){ CL.me.backupNow(); return; }
  if (b.dataset.backupx){ CL.store.S.profile.backupSnooze=U.addDays(U.today(), 7); CL.store.changed(); return; }
  if (b.dataset.review){ CL.store.S.profile.reviewSeen=U.addDays(U.weekStart(U.today()), -7); CL.progress.resetWeek(); CL.store.changed(); CL.app.setTab("progress"); return; }
  if (b.dataset.water){
    const d=CL.store.day(date), v=b.dataset.water;
    if (v==="+1") d.water=(d.water||0)+1;
    else { const n=+v; d.water = d.water===n? n-1 : n; }
    CL.store.pruneEmptyDay(date); CL.store.changed(); return;
  }
}

function mealMenu(date, meal){
  const items=CL.store.peekDay(date).entries.filter(e=>e.meal===meal);
  const yd=U.addDays(date,-1), ydItems=CL.store.peekDay(yd).entries.filter(e=>e.meal===meal);
  const body=
    '<button type="button" class="btn block" data-mm="copy"'+(ydItems.length? "" : " disabled")+'>'+icon("copy")+'Copy '+meal.toLowerCase()+' from yesterday'+(ydItems.length? " ("+ydItems.length+")" : "")+'</button>'+
    '<button type="button" class="btn block" data-mm="save"'+(items.length? "" : " disabled")+'>'+icon("star")+'Save this '+meal.toLowerCase()+' as a meal</button>'+
    '<p class="hint">Saved meals show up when you tap + so you can log them again in one tap.</p>';
  const el=I.openSheet({title:meal, body});
  el.onclick=e=>{
    const b=e.target.closest("[data-mm]"); if (!b) return;
    if (b.dataset.mm==="copy"){ I.closeSheet(); I.copyEntries(yd, date, meal); }
    if (b.dataset.mm==="save"){
      const name=prompt("Name this meal", meal+" usual");
      if (!name) return;
      const S=CL.store.S;
      S.meals=[{id:U.uid(), name:name.trim().slice(0,60), items:items.map(e=>({name:e.name, brand:e.brand||"", serving:e.serving, servings:e.servings, kcal:e.kcal, protein:e.protein, carbs:e.carbs, fat:e.fat, fiber:e.fiber==null? null : e.fiber, food:e.food||null}))}, ...S.meals].slice(0,60);
      CL.store.changed(); I.closeSheet(); I.toast("Saved "+name.trim());
    }
  };
}

CL.today={render, onClick, onSubmit, weekInfo};
})();
