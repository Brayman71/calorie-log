/* Meals screen: the week's plan, recipes with step-by-step guides, the grocery list and prep steps. */
window.CL = window.CL || {};
(function(){
const U=CL.util, I=CL.ui, P=CL.planner, esc=U.esc, icon=I.icon, $=I.$;
let gen=null;                 // {week, ctl, status, detail} while Claude writes a plan
const open=new Set();         // recipe cards the person expanded

function planTargets(){
  const p=CL.math.currentPlan();
  if (p) return p;
  const G=CL.math.goals();
  return {target:G.goal, flex:G.flex||Math.round(G.goal*0.1/10)*10, protein:G.protein, pMin:Math.round(G.protein*0.8), carbs:G.carbs, fat:G.fat, fiber:G.fiber};
}
function health(){ return CL.store.S.health || {}; }
function weekLabel(wk){ return U.shortDate(wk)+" – "+U.shortDate(U.addDays(wk,6)); }

function buildLibrary(wk, seed){
  const S=CL.store.S, prev=S.plans[U.addDays(wk,-7)];
  const plan=P.buildWeek(planTargets(), health(), {seed:seed||Date.now(), recentIds:(prev&&prev.recipes||[]).map(r=>r.id)});
  if (!plan){ I.toast("Not enough recipes match your food preferences. Loosen the 'won't eat' list in Me."); return; }
  plan.weekStart=wk;
  S.plans[wk]=plan; open.clear();
  CL.state.planDay = wk===U.weekStart(U.today())? U.dayIdx(U.today()) : 0;
  CL.state.planView="meals";
  CL.store.changed();
  I.toast("Your week is ready");
}

async function buildClaude(wk, req){
  if (gen) return;
  const S=CL.store.S, prev=S.plans[U.addDays(wk,-7)];
  const avoid=[...((S.plans[wk]&&S.plans[wk].recipes)||[]), ...((prev&&prev.recipes)||[])].map(r=>r.name).slice(0,30);
  const ctl=new AbortController();
  gen={week:wk, ctl, status:"Thinking about your week…", detail:"Balancing your targets, the foods you like and your cooking time. This usually takes 1–2 minutes."};
  render();
  try {
    const plan=await CL.claude.planWeek(planTargets(), health(), req, avoid, {signal:ctl.signal, onText:text=>{
      const n=(text.match(/"steps"\s*:/g)||[]).length;
      gen.status = text.includes('"days"')? "Laying out your week…" : n? "Writing recipes…" : "Starting to write…";
      gen.detail = n? n+(n===1? " recipe" : " recipes")+" written so far." : "Getting started.";
      const s=$("genStatus"), d=$("genDetail"); if (s){ s.textContent=gen.status; d.textContent=gen.detail; }
    }});
    plan.weekStart=wk; plan.requests=req||"";
    S.plans[wk]=plan; open.clear();
    CL.state.planDay = wk===U.weekStart(U.today())? U.dayIdx(U.today()) : 0;
    CL.state.planView="meals";
    gen=null; CL.store.changed();
    I.toast("Claude wrote your week");
  } catch(e){
    gen=null; render();
    if (!(e && (e.name==="AbortError" || e.name==="APIUserAbortError"))) I.toast(CL.claude.errorText(e));
  }
}

/* Log a planned meal to the food log (portion included). */
function logSlot(date, slot){
  const plan=CL.store.S.plans[U.weekStart(date)]; if (!plan) return;
  const r=P.recipeById(plan, (plan.days[U.dayIdx(date)]||{})[slot]); if (!r) return;
  const f=P.portion(plan);
  const already=CL.store.peekDay(date).entries.some(e=>e.plan===date+":"+slot);
  if (already){ I.toast("Already logged"); return; }
  I.addEntry(date, {name:r.name, serving:"1 serving", kcal:r.kcal, protein:r.protein, carbs:r.carbs, fat:r.fat, fiber:r.fiber==null? null : r.fiber, src:"recipe"}, f, I.SLOT_MEAL[slot], {plan:date+":"+slot});
  I.toast("Logged "+r.name+" · "+U.fmt(r.kcal*f)+" kcal");
}

function recipeCard(plan, wk, di, slot){
  const r=P.recipeById(plan, (plan.days[di]||{})[slot]);
  const key=di+":"+slot;
  if (!r) return '<section class="card"><div class="slot hint">'+I.SLOT_MEAL[slot]+'</div><p class="hint">Nothing planned. Eat something you like and log it.</p></section>';
  const f=P.portion(plan), date=U.addDays(wk, di);
  const logged=CL.store.peekDay(date).entries.some(e=>e.plan===date+":"+slot);
  const leftover = slot==="lunch" && r.meal==="dinner";
  let portion="";
  if (plan.source==="library"){
    const hh=plan.household||1;
    portion='<div class="portion"><b>Your portion: '+(f===1? "1 serving" : U.frac(f)+" servings")+' · '+U.fmt(r.kcal*f)+' kcal · '+Math.round(r.protein*f)+' g protein</b><br>'+
      (leftover? "Leftovers from dinner. Just reheat. " : "")+
      (r.servings>1? "The recipe makes "+r.servings+" servings. "+(r.batches===1? "Cook it once" : "Cook "+U.frac(r.batches)+"× the recipe")+" to cover "+(r.eaten===1? "this meal" : "all "+r.eaten+" meals")+" this week"+(hh>1? " for "+hh+" people" : "")+"."+(r.freezeExtra? " Freeze what's left." : "")
        : "Make it fresh"+(r.eaten>1? " each time (it's on the plan "+r.eaten+" times this week)" : "")+(hh>1? ", "+hh+" portions" : "")+".")+'</div>';
  } else {
    portion='<div class="portion"><b>'+U.fmt(r.kcal)+' kcal · '+r.protein+' g protein per serving</b>'+(leftover? "<br>Leftovers from dinner. Just reheat." : r.servings>1? "<br>Makes "+r.servings+" servings." : "")+'</div>';
  }
  return '<details class="card recipe" data-rkey="'+key+'"'+(open.has(key)? " open" : "")+'><summary><div class="grow"><div class="slot">'+I.SLOT_MEAL[slot]+(leftover? " · leftovers" : "")+'</div><div class="nm">'+esc(r.name)+'</div>'+
    '<div class="meta num">'+U.fmt(P.slotKcal(plan, r))+' kcal · '+Math.round(r.protein*f)+' g protein · '+r.minutes+' min</div></div>'+
    (logged? '<span class="chip good">'+icon("check")+'Logged</span>' : "")+icon("right","chev")+'</summary>'+
    '<div class="body">'+portion+
    '<div><h3 style="margin-bottom:6px">Ingredients</h3><ul>'+P.ingredientLines(r).map(t=>'<li>'+esc(t)+'</li>').join("")+'</ul></div>'+
    '<div><h3 style="margin-bottom:6px">Steps</h3><ol>'+r.steps.map(t=>'<li>'+esc(t)+'</li>').join("")+'</ol></div>'+
    (r.tip? '<p class="tip"><b>Tip:</b> '+esc(r.tip)+'</p>' : "")+
    '<div class="row">'+(logged? "" : '<button type="button" class="btn primary small" data-logslot="'+slot+'" data-date="'+date+'">'+icon("check")+'I ate this</button>')+
    '<button type="button" class="btn small" data-swap="'+slot+'">'+icon("swap")+'Swap</button></div></div></details>';
}

function groceryHTML(plan, wk){
  const checked=plan.checked||{}, g=plan.grocery||[];
  const n=g.reduce((a,s)=>a+s.items.length,0), done=g.reduce((a,s)=>a+s.items.filter(it=>checked[s.section+"|"+it]).length,0);
  if (!n) return '<section class="card"><p class="hint">No grocery list for this plan.</p></section>';
  return '<section class="card grocery"><div class="cardhead"><h2>Groceries</h2><span class="hint">'+done+' of '+n+' in the cart</span></div>'+
    (plan.source==="library" && (plan.household||1)>1? '<p class="hint">Amounts cover '+plan.household+' people.</p>' : "")+
    g.map(s=>'<h3>'+esc(s.section)+'</h3><ul class="gitems">'+s.items.map(it=>{ const k=s.section+"|"+it; return '<li><label><input type="checkbox" data-gk="'+esc(k)+'"'+(checked[k]? " checked" : "")+'><span>'+esc(it)+'</span></label></li>'; }).join("")+'</ul>').join("")+
    '<div class="row" style="margin-top:14px"><button type="button" class="btn small" data-share="1">'+icon("share")+'Share list</button>'+(done? '<button type="button" class="btn small" data-uncheck="1">Uncheck all</button>' : "")+'</div>'+
    '<p class="fine">Check your pantry first: spices, oil and sauces often last for weeks.</p></section>';
}

function render(){
  const el=$("screen-plan"), st=CL.state, wk=st.week, S=CL.store.S, plan=S.plans[wk];
  const thisWk=U.weekStart(U.today());
  let x='<header class="screenhead"><h1>Meals</h1><div class="weeknav"><button type="button" class="iconbtn" data-wk="-7" aria-label="Previous week">'+icon("left")+'</button>'+
    '<span class="date">'+esc(wk===thisWk? "This week" : wk===U.addDays(thisWk,7)? "Next week" : weekLabel(wk))+'</span>'+
    '<button type="button" class="iconbtn" data-wk="7" aria-label="Next week"'+(wk>=U.addDays(thisWk,7)? " disabled" : "")+'>'+icon("right")+'</button></div></header>';

  if (gen && gen.week===wk){
    x+='<section class="card genprog" aria-live="polite"><div class="loading"><span class="spinner"></span><b id="genStatus">'+esc(gen.status)+'</b></div><p class="hint" id="genDetail">'+esc(gen.detail)+'</p><button type="button" class="btn small" data-stopgen="1" style="justify-self:start">Stop</button></section>';
    el.innerHTML=x; return;
  }

  if (!plan){
    const t=planTargets(), key=CL.claude.hasKey();
    x+='<section class="card"><h2 style="margin-bottom:8px">Plan '+(wk===thisWk? "this week" : "the week of "+esc(U.shortDate(wk)))+'</h2>'+
      '<p>Easy recipes that fit about <b>'+U.fmt(t.target-t.flex)+' kcal</b> of meals a day, with dinners that turn into next-day lunches so you cook 4 nights, not 7. You get a combined grocery list and step-by-step guides.</p>'+
      (S.health? "" : '<p class="notice" style="margin-top:10px">Answer the questions in <button type="button" class="linkbtn" data-tabgo="me">Me</button> first for meals that match your tastes and targets.</p>')+
      '<button type="button" class="btn primary block" data-build="lib" style="margin-top:14px">'+icon("book")+'Build my week from the recipe book</button>'+
      '<p class="fine">Instant, free and works offline. '+CL.RECIPES.length+' recipes, filtered by your diet, allergies and cooking time.</p></section>';
    x+='<section class="card"><h2 style="margin-bottom:8px">'+icon("sparkle")+' Or have Claude write one</h2>'+
      (key? '<p class="hint">Brand-new recipes written around what you love. Takes 1–2 minutes and costs about 10–25 cents on your API key.</p>'+
        '<div class="field" style="margin-top:10px"><label for="planReq">Anything special this week? (optional)</label><textarea id="planReq" rows="2" maxlength="300" placeholder="e.g. use up a bag of spinach, no fish, something cozy"></textarea></div>'+
        '<button type="button" class="btn soft block" data-build="claude" style="margin-top:10px">'+icon("sparkle")+'Write my week with Claude</button>'
        : '<p class="hint">Add your Anthropic API key in <button type="button" class="linkbtn" data-tabgo="me">Me → Settings</button> to get recipes written just for you. Totally optional.</p>')+'</section>';
    el.innerHTML=x; return;
  }

  const di=Math.min(6, Math.max(0, st.planDay||0)), view=st.planView||"meals";
  const n=(plan.grocery||[]).reduce((a,s)=>a+s.items.length,0), done=Object.values(plan.checked||{}).filter(Boolean).length;
  x+='<section class="card"><div class="between"><span class="chip">'+(plan.source==="library"? icon("book")+"Recipe book" : icon("sparkle")+"Written by Claude")+'</span>'+
    '<button type="button" class="btn small" data-planmenu="1">New plan</button></div><p style="margin-top:10px">'+esc(plan.summary||"")+'</p></section>';
  x+='<div class="tabs3" role="tablist"><button type="button" role="tab" data-view="meals" aria-selected="'+(view==="meals")+'">Meals</button>'+
    '<button type="button" role="tab" data-view="grocery" aria-selected="'+(view==="grocery")+'">Groceries'+(n? " ("+(n-done)+")" : "")+'</button>'+
    '<button type="button" role="tab" data-view="prep" aria-selected="'+(view==="prep")+'">Prep</button></div>';

  if (view==="meals"){
    const today=U.today();
    x+='<div class="days" role="group" aria-label="Day">'+P.DAYN.map((d,i)=>{ const t=P.dayTotal(plan,i); const date=U.addDays(wk,i);
      return '<button type="button" data-pday="'+i+'" aria-pressed="'+(i===di)+'"'+(date===today? ' class="today"' : "")+'>'+d+'<small class="num">'+U.fmt(t.kcal)+'</small></button>'; }).join("")+'</div>';
    const t=P.dayTotal(plan, di), G=planTargets();
    x+='<p class="hint num" style="text-align:center">'+esc(U.shortDate(U.addDays(wk,di),{weekday:"long", month:"short", day:"numeric"}))+': '+U.fmt(t.kcal)+' kcal planned · '+Math.round(t.protein)+' g protein · '+U.fmt(Math.max(0,G.target-t.kcal))+' kcal left for treats or extras</p>';
    x+=P.SLOT_KEYS.map(s=>recipeCard(plan, wk, di, s)).join("");
  } else if (view==="grocery"){
    x+=groceryHTML(plan, wk);
  } else {
    x+='<section class="card"><h2 style="margin-bottom:10px">Prep plan</h2><ol class="prep">'+(plan.prep||[]).map(t=>'<li>'+esc(t)+'</li>').join("")+'</ol>'+
      '<p class="fine">Cooked food keeps 3–4 days in the fridge. Freeze anything you won\'t eat by then.</p></section>';
  }
  el.innerHTML=x;
}

function planMenu(){
  const wk=CL.state.week, plan=CL.store.S.plans[wk], key=CL.claude.hasKey();
  const body='<button type="button" class="btn block" data-pm="shuffle">'+icon("book")+'New week from the recipe book</button>'+
    (key? '<div class="field"><label for="planReq2">Ask Claude for something specific (optional)</label><textarea id="planReq2" rows="2" maxlength="300" placeholder="e.g. more Mexican food, cheaper meals"></textarea></div><button type="button" class="btn soft block" data-pm="claude">'+icon("sparkle")+'Have Claude write a new week</button>' : "")+
    '<button type="button" class="btn block danger" data-pm="delete">'+icon("trash")+'Delete this plan</button>'+
    '<p class="hint">A new plan replaces this week\'s meals and grocery list. Food you already logged stays logged.</p>';
  const el=I.openSheet({title:"New plan", body});
  el.onclick=e=>{
    const b=e.target.closest("[data-pm]"); if (!b) return;
    const a=b.dataset.pm;
    if (a==="shuffle"){ I.closeSheet(); buildLibrary(wk); }
    if (a==="claude"){ const req=$("planReq2").value.trim().slice(0,300); I.closeSheet(); buildClaude(wk, req); }
    if (a==="delete"){
      const before=plan; delete CL.store.S.plans[wk]; I.closeSheet(); CL.store.changed();
      I.toast("Plan deleted", ()=>{ CL.store.S.plans[wk]=before; CL.store.changed(); });
    }
  };
}

function swapSheet(slot){
  const wk=CL.state.week, di=CL.state.planDay||0, plan=CL.store.S.plans[wk]; if (!plan) return;
  const curId=(plan.days[di]||{})[slot], cur=P.recipeById(plan, curId);
  const opts=P.swapOptions(plan, health(), slot, curId);
  const usedTimes=cur? P.usage(plan)[cur.id] : 0;
  const body=(cur && usedTimes>1? '<p class="hint">“'+esc(cur.name)+'” is on the plan '+usedTimes+' times this week (cook once, eat again). Swapping replaces all of them.</p>' : "")+
    (opts.length? '<ul class="results">'+opts.map((r,i)=>'<li><button type="button" class="res" data-opt="'+i+'"><div class="grow"><div class="nm">'+esc(r.name)+'</div><div class="sub">'+r.minutes+' min · '+r.protein+' g protein'+(r.tags.length? " · "+esc(r.tags.join(", ")) : "")+'</div></div><span class="kc num">'+U.fmt(r.kcal*P.portion(plan))+'</span></button></li>').join("")+'</ul>' : '<p class="hint">No other recipe-book options match your preferences for this meal.</p>')+
    (CL.claude.hasKey()? '<button type="button" class="btn soft block" data-claude="1">'+icon("sparkle")+'Ask Claude for something new</button>' : "");
  const el=I.openSheet({title:"Swap "+I.SLOT_MEAL[slot].toLowerCase(), body});
  el.onclick=async e=>{
    const b=e.target.closest("button"); if (!b) return;
    const S=CL.store.S, before=U.clone(plan);
    if (b.dataset.opt){
      const r=opts[+b.dataset.opt];
      let next=P.applySwap(plan, curId, r);
      if (next.source!=="library"){ addGrocery(next, P.ingredientLines(r)); }
      S.plans[wk]=next; open.add(di+":"+slot);
      I.closeSheet(); CL.store.changed();
      I.toast("Swapped in "+r.name, ()=>{ S.plans[wk]=before; CL.store.changed(); });
    }
    if (b.dataset.claude){
      I.setSheet({body:'<div class="loading"><span class="spinner"></span>Claude is writing a new '+I.SLOT_MEAL[slot].toLowerCase()+'…</div>'});
      try {
        const res=await CL.claude.swapRecipe(planTargets(), health(), slot, cur, plan.recipes.map(r=>r.name));
        let next=P.applySwap(plan, curId, res.recipe);
        if (next.source!=="library") addGrocery(next, res.additions);
        S.plans[wk]=next; open.add(di+":"+slot);
        I.closeSheet(); CL.store.changed();
        I.toast("Swapped in "+res.recipe.name, ()=>{ S.plans[wk]=before; CL.store.changed(); });
      } catch(err){ I.setSheet({body:'<p class="notice">'+esc(CL.claude.errorText(err))+'</p>'}); }
    }
  };
}
function addGrocery(plan, items){
  if (!items || !items.length) return;
  let g=plan.grocery.find(x=>x.section==="Added for swaps");
  if (!g){ g={section:"Added for swaps", items:[]}; plan.grocery.push(g); }
  for (const it of items) if (!g.items.includes(it)) g.items.push(it);
}

async function shareGrocery(){
  const plan=CL.store.S.plans[CL.state.week]; if (!plan) return;
  const checked=plan.checked||{};
  const text="Groceries for "+weekLabel(CL.state.week)+"\n\n"+(plan.grocery||[]).map(s=>s.section.toUpperCase()+"\n"+s.items.filter(it=>!checked[s.section+"|"+it]).map(it=>"☐ "+it).join("\n")).filter(s=>s.includes("☐")).join("\n\n");
  try {
    if (navigator.share){ await navigator.share({title:"Grocery list", text}); return; }
    await navigator.clipboard.writeText(text); I.toast("Grocery list copied. Paste it into Notes or Reminders.");
  } catch(e){
    if (e && e.name==="AbortError") return;
    I.openSheet({title:"Grocery list", body:'<p class="hint">Select all and copy:</p><textarea rows="14" readonly>'+esc(text)+'</textarea>'});
  }
}

function onClick(e){
  const b=e.target.closest("button");
  const sum=e.target.closest("summary");
  if (sum){ const d=sum.parentElement, k=d.dataset.rkey; setTimeout(()=>{ if (d.open) open.add(k); else open.delete(k); }, 0); return; }
  if (!b) return;
  const st=CL.state;
  if (b.dataset.wk){ st.week=U.addDays(st.week, +b.dataset.wk); st.planDay = st.week===U.weekStart(U.today())? U.dayIdx(U.today()) : 0; open.clear(); render(); return; }
  if (b.dataset.build==="lib"){ buildLibrary(st.week); return; }
  if (b.dataset.build==="claude"){ buildClaude(st.week, ($("planReq")||{}).value? $("planReq").value.trim().slice(0,300) : ""); return; }
  if (b.dataset.stopgen){ if (gen) gen.ctl.abort(); gen=null; render(); return; }
  if (b.dataset.tabgo){ CL.app.setTab(b.dataset.tabgo); return; }
  if (b.dataset.planmenu){ planMenu(); return; }
  if (b.dataset.view){ st.planView=b.dataset.view; render(); return; }
  if (b.dataset.pday){ st.planDay=+b.dataset.pday; render(); return; }
  if (b.dataset.logslot){ logSlot(b.dataset.date, b.dataset.logslot); return; }
  if (b.dataset.swap){ swapSheet(b.dataset.swap); return; }
  if (b.dataset.share){ shareGrocery(); return; }
  if (b.dataset.uncheck){ const p=CL.store.S.plans[st.week]; p.checked={}; CL.store.changed(); return; }
}
function onChange(e){
  const t=e.target;
  if (t.dataset && t.dataset.gk){
    const p=CL.store.S.plans[CL.state.week]; if (!p) return;
    p.checked=p.checked||{}; if (t.checked) p.checked[t.dataset.gk]=true; else delete p.checked[t.dataset.gk];
    CL.store.changed();
  }
}

CL.planUI={render, onClick, onChange, logSlot, buildLibrary, get busy(){ return !!gen; }};
})();
