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

function startMine(wk){
  const plan=P.emptyWeek(planTargets(), health()); plan.weekStart=wk;
  CL.store.S.plans[wk]=plan; open.clear();
  CL.state.planDay = wk===U.weekStart(U.today())? U.dayIdx(U.today()) : 0;
  CL.state.planView="meals";
  CL.store.changed();
  I.toast("Empty week ready. Tap Choose on any meal.");
}

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

/* Shared recipe bits: the stat line, the "why it's popular" note, ingredients and steps. */
function metaHTML(kcal, protein, minutes){
  return '<div class="meta num"><span>'+U.fmt(kcal)+' kcal</span><span>'+Math.round(protein)+' g protein</span><span>'+icon("clock")+minutes+' min</span></div>';
}
function badgeHTML(r){ return r.fame? '<span class="badge">'+icon("trend")+'Popular</span>' : ""; }
function recipeGuide(r){
  return (r.fame? '<p class="fame">'+icon("trend")+'<span>'+esc(r.fame)+'</span></p>' : "")+
    '<div><h3 style="margin-bottom:8px">Ingredients</h3><ul>'+P.ingredientLines(r).map(t=>'<li>'+esc(t)+'</li>').join("")+'</ul></div>'+
    '<div><h3 style="margin-bottom:10px">Steps</h3><ol>'+r.steps.map(t=>'<li><span>'+esc(t)+'</span></li>').join("")+'</ol></div>'+
    (r.tip? '<p class="tip"><b>Tip:</b> '+esc(r.tip)+'</p>' : "");
}

function recipeCard(plan, wk, di, slot){
  const r=P.recipeById(plan, (plan.days[di]||{})[slot]);
  const key=di+":"+slot;
  if (!r) return '<section class="card recipe"><div class="row" style="padding:12px;flex-wrap:nowrap;gap:12px">'+I.mealBadge(slot, "thumb")+'<div class="grow"><div class="slot">'+I.SLOT_MEAL[slot]+'</div><p class="hint">Nothing planned yet.</p></div>'+
    '<button type="button" class="btn small soft" data-pick="'+slot+'">'+icon("plus")+'Choose</button></div></section>';
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
  return '<details class="card recipe" data-rkey="'+key+'"'+(open.has(key)? " open" : "")+'><summary>'+I.mealBadge(slot, "thumb")+'<div class="grow"><div class="slot">'+I.SLOT_MEAL[slot]+(leftover? " · leftovers" : "")+badgeHTML(r)+'</div><div class="nm">'+esc(r.name)+'</div>'+
    metaHTML(P.slotKcal(plan, r), r.protein*f, leftover? 2 : r.minutes)+'</div>'+
    (logged? '<span class="chip good">'+icon("check")+'Logged</span>' : "")+icon("right","chev")+'</summary>'+
    '<div class="body">'+portion+
    recipeGuide(r)+
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
  let x='<header class="screenhead"><div><div class="eyebrow">Plan, shop, cook</div><h1>Meals</h1></div><div class="weeknav"><button type="button" class="iconbtn" data-wk="-7" aria-label="Previous week">'+icon("left")+'</button>'+
    '<span class="date">'+esc(wk===thisWk? "This week" : wk===U.addDays(thisWk,7)? "Next week" : weekLabel(wk))+'</span>'+
    '<button type="button" class="iconbtn" data-wk="7" aria-label="Next week"'+(wk>=U.addDays(thisWk,7)? " disabled" : "")+'>'+icon("right")+'</button></div></header>';

  x+='<button type="button" class="card bookcta" data-book="1">'+I.mealBadge("dinner","thumb")+'<span class="grow"><b>Recipe book</b><span class="hint">'+CL.RECIPES.length+' easy recipes, '+CL.RECIPES.filter(r=>r.fame).length+' of them popular picks from TikTok and the web</span></span>'+icon("right")+'</button>';

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
      '<p class="fine">Instant, free and works offline. '+CL.RECIPES.length+' recipes, filtered by your diet, allergies and cooking time.</p>'+
      '<button type="button" class="btn block" data-build="mine" style="margin-top:12px">'+icon("star")+'Pick my own recipes instead</button>'+
      '<p class="fine">Start with an empty week and fill each day from the recipe book. You still get portions, a grocery list and a prep plan.</p></section>';
    x+='<section class="card"><h2 style="margin-bottom:8px">'+icon("sparkle")+' Or have Claude write one</h2>'+
      (key? '<p class="hint">Brand-new recipes written around what you love. Takes 1–2 minutes and costs about 10–25 cents on your API key.</p>'+
        '<div class="field" style="margin-top:10px"><label for="planReq">Anything special this week? (optional)</label><textarea id="planReq" rows="2" maxlength="300" placeholder="e.g. use up a bag of spinach, no fish, something cozy"></textarea></div>'+
        '<button type="button" class="btn soft block" data-build="claude" style="margin-top:10px">'+icon("sparkle")+'Write my week with Claude</button>'
        : '<p class="hint">Add your Anthropic API key in <button type="button" class="linkbtn" data-tabgo="me">Me → Settings</button> to get recipes written just for you. Totally optional.</p>')+'</section>';
    el.innerHTML=x; return;
  }

  const di=Math.min(6, Math.max(0, st.planDay||0)), view=st.planView||"meals";
  const n=(plan.grocery||[]).reduce((a,s)=>a+s.items.length,0), done=Object.values(plan.checked||{}).filter(Boolean).length;
  x+='<section class="card"><div class="between"><span class="chip">'+(plan.custom? icon("star")+"My picks" : plan.source==="library"? icon("book")+"Recipe book" : icon("sparkle")+"Written by Claude")+'</span>'+
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

/* Recipe book: browse every built-in recipe, read the guide, log a serving. */
const bookState={filter:"popular", q:"", mine:true, open:null, target:null};   // target = {wk, di, slot} when choosing for a meal
const MEAL_ORDER=["breakfast","lunch","dinner","snack"];
function bookList(){
  const ok=new Set(P.allowed(health()).map(r=>r.id)), q=bookState.q.trim().toLowerCase(), f=bookState.filter;
  return CL.RECIPES.filter(r=>(!bookState.mine || !CL.store.S.health || ok.has(r.id)) &&
    (f==="all" || (f==="popular"? !!r.fame : f==="starred"? P.starred().includes(r.id) : r.meal===f)) &&
    (!q || (r.name+" "+(r.ingredients||[]).map(i=>Array.isArray(i)? i[2] : i).join(" ")).toLowerCase().includes(q)))
    .sort((a,b)=>(+!!b.fame)-(+!!a.fame) || MEAL_ORDER.indexOf(a.meal)-MEAL_ORDER.indexOf(b.meal));
}
function bookBody(){
  const F=[["popular","Popular","trend"],["starred","Starred","star"],["breakfast","Breakfast","coffee"],["lunch","Lunch","salad"],["dinner","Dinner","pot"],["snack","Snacks","apple"],["all","All",null]];
  const t=bookState.target;
  return (t? '<p class="notice info">Choosing <b>'+esc(P.DAYN[t.di]+" "+I.SLOT_MEAL[t.slot].toLowerCase())+'</b>. Tap a recipe, then <b>Put it here</b>.'+(t.slot==="lunch"? " Dinners work for lunch too." : "")+'</p>' : "")+
    '<div class="filters" role="group" aria-label="Show">'+F.map(([k,l,ic])=>'<button type="button" data-bf="'+k+'" aria-pressed="'+(bookState.filter===k)+'">'+(ic? icon(ic) : "")+l+'</button>').join("")+'</div>'+
    '<div class="searchbox"><input type="search" id="bookQ" placeholder="Search recipes or ingredients" value="'+esc(bookState.q)+'" aria-label="Search recipes" autocomplete="off"></div>'+
    (CL.store.S.health? '<label class="check"><input type="checkbox" id="bookMine"'+(bookState.mine? " checked" : "")+'><span>Only recipes that fit my diet and allergies</span></label>' : "")+
    '<div class="book" id="bookList">'+bookItems(bookList())+'</div>';
}
function bookItems(list){
  if (!list.length) return '<p class="hint">'+(bookState.filter==="starred"? "No starred recipes yet. Open any recipe and tap Star to save it here. Starred recipes also come up more often when the app builds your week." : "No recipes match. Try another filter.")+'</p>';
  const favs=P.starred(), t=bookState.target;
  return list.map(r=>'<details class="card recipe" data-bid="'+r.id+'"'+(bookState.open===r.id? " open" : "")+'><summary>'+I.mealBadge(r.meal, "thumb")+'<div class="grow"><div class="slot">'+I.SLOT_MEAL[r.meal]+badgeHTML(r)+'</div><div class="nm">'+esc(r.name)+'</div>'+metaHTML(r.kcal, r.protein, r.minutes)+'</div></summary>'+
    '<div class="body"><div class="portion"><b>Per serving: '+U.fmt(r.kcal)+' kcal · '+r.protein+' g protein · '+r.carbs+' g carbs · '+r.fat+' g fat</b><br>Makes '+r.servings+(r.servings===1? " serving" : " servings")+'.</div>'+recipeGuide(r)+
    '<div class="row">'+(t? '<button type="button" class="btn primary small" data-bput="'+r.id+'">'+icon("check")+'Put it here</button>' : '<button type="button" class="btn primary small" data-badd="'+r.id+'">'+icon("plus")+'Add to my week</button>')+
    '<button type="button" class="btn small" data-blog="'+r.id+'">'+icon("check")+'Log 1 serving today</button>'+
    '<button type="button" class="btn small" data-bstar="'+r.id+'" aria-pressed="'+favs.includes(r.id)+'">'+icon("star")+(favs.includes(r.id)? "Starred" : "Star")+'</button></div></div></details>').join("");
}
function bookSheet(target){
  bookState.target=target||null;
  if (target){ bookState.filter = target.slot==="lunch"? "lunch" : target.slot; bookState.q=""; bookState.open=null; }
  else if (bookState.filter && !["popular","starred","all"].includes(bookState.filter) && bookState.prevTarget) bookState.filter="popular";
  bookState.prevTarget=!!target;
  const el=I.openSheet({title:target? "Choose a "+(target.slot==="snack"? "snack" : I.SLOT_MEAL[target.slot].toLowerCase()) : "Recipe book", body:bookBody()});
  const refresh=()=>{ $("bookList").innerHTML=bookItems(bookList()); };
  el.onclick=e=>{
    const sum=e.target.closest("summary");
    if (sum){ const d=sum.parentElement; setTimeout(()=>{ if (d.open) bookState.open=d.dataset.bid; else if (bookState.open===d.dataset.bid) bookState.open=null; }, 0); return; }
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.bf){ bookState.filter=b.dataset.bf; bookState.open=null; el.querySelectorAll("[data-bf]").forEach(x=>x.setAttribute("aria-pressed", x===b)); b.scrollIntoView({inline:"nearest", block:"nearest"}); refresh(); return; }
    if (b.dataset.bstar){
      const S=CL.store.S, id=b.dataset.bstar, favs=S.profile.recipeFavs=(S.profile.recipeFavs||[]).filter(x=>x!==id);
      const on=b.getAttribute("aria-pressed")!=="true";
      if (on) favs.unshift(id);
      CL.store.changed();
      b.setAttribute("aria-pressed", on); b.innerHTML=icon("star")+(on? "Starred" : "Star");
      I.toast(on? "Starred. Find it under the Starred filter." : "Removed from Starred");
      return;
    }
    if (b.dataset.bput){
      const r=CL.RECIPES.find(x=>x.id===b.dataset.bput), t=bookState.target; if (!r || !t) return;
      I.closeSheet(); placeRecipe(t.wk, t.di, t.slot, r, false); return;
    }
    if (b.dataset.badd){ const r=CL.RECIPES.find(x=>x.id===b.dataset.badd); if (r) addSheet(r); return; }
    if (b.dataset.blog){
      const r=CL.RECIPES.find(x=>x.id===b.dataset.blog); if (!r) return;
      const meal=I.SLOT_MEAL[r.meal];
      I.addEntry(U.today(), {name:r.name, serving:"1 serving", kcal:r.kcal, protein:r.protein, carbs:r.carbs, fat:r.fat, fiber:r.fiber==null? null : r.fiber, src:"recipe"}, 1, meal);
      I.toast("Logged "+r.name+" to "+meal.toLowerCase());
    }
  };
  el.oninput=e=>{ if (e.target.id==="bookQ"){ bookState.q=e.target.value; refresh(); } };
  el.onchange=e=>{ if (e.target.id==="bookMine"){ bookState.mine=e.target.checked; refresh(); } };
}

/* Put a recipe on a day of the week, creating a hand-picked week if there's no plan yet. */
function placeRecipe(wk, di, slot, r, leftovers){
  const S=CL.store.S, had=S.plans[wk], before=had? U.clone(had) : null;
  let plan=had;
  if (!plan){ plan=P.emptyWeek(planTargets(), health()); plan.weekStart=wk; }
  let next=P.setSlot(plan, di, slot, r);
  if (leftovers && di<6) next=P.setSlot(next, di+1, "lunch", r);
  if (next.source!=="library") addGrocery(next, P.ingredientLines(r));
  next.weekStart=wk;
  S.plans[wk]=next;
  CL.state.week=wk; CL.state.planDay=di; CL.state.planView="meals";
  if (CL.state.tab!=="plan") CL.app.setTab("plan");
  CL.store.changed();
  I.toast("Added to "+P.DAYN[di]+" "+I.SLOT_MEAL[slot].toLowerCase()+(leftovers && di<6? " + "+P.DAYN[di+1]+" lunch" : ""), ()=>{ if (before) S.plans[wk]=before; else delete S.plans[wk]; CL.store.changed(); });
}
function addSheet(r){
  const thisWk=U.weekStart(U.today()), nextWk=U.addDays(thisWk,7);
  let wk = CL.state.week===nextWk? nextWk : thisWk;
  let di = wk===thisWk? U.dayIdx(U.today()) : 0;
  let slot = r.meal, leftovers = r.meal==="dinner" && r.servings>1;
  const draw=()=>{
    const plan=CL.store.S.plans[wk], cur=plan && P.recipeById(plan, (plan.days[di]||{})[slot]);
    const canLeft = slot==="dinner" && r.servings>1 && di<6;
    const today=U.today();
    I.setSheet({body:
      '<p><b>'+esc(r.name)+'</b></p>'+
      '<div class="tabs3" role="group" aria-label="Week"><button type="button" data-aw="'+thisWk+'" aria-selected="'+(wk===thisWk)+'">This week</button><button type="button" data-aw="'+nextWk+'" aria-selected="'+(wk===nextWk)+'">Next week</button></div>'+
      '<div class="days" role="group" aria-label="Day">'+P.DAYN.map((d,i)=>{ const date=U.addDays(wk,i); return '<button type="button" data-ad="'+i+'" aria-pressed="'+(i===di)+'"'+(date===today? ' class="today"' : "")+(date<today? " disabled" : "")+'>'+d+'<small>'+U.parseDay(date).getDate()+'</small></button>'; }).join("")+'</div>'+
      '<div class="filters" role="group" aria-label="Meal">'+P.SLOT_KEYS.map(k=>'<button type="button" data-as="'+k+'" aria-pressed="'+(k===slot)+'">'+I.SLOT_MEAL[k]+'</button>').join("")+'</div>'+
      (canLeft? '<label class="check"><input type="checkbox" id="addLeft"'+(leftovers? " checked" : "")+'><span>Also have the leftovers for '+P.DAYN[di+1]+' lunch</span></label>' : "")+
      (cur? '<p class="hint">Replaces '+esc(cur.name)+'.</p>' : "")+
      (!plan? '<p class="hint">There\'s no plan for this week yet, so this starts a hand-picked week. Fill the other meals the same way.</p>' : "")+
      '<button type="button" class="btn primary block" data-ago="1">'+icon("check")+'Add to '+P.DAYN[di]+' '+I.SLOT_MEAL[slot].toLowerCase()+'</button>'+
      '<button type="button" class="btn block" data-aback="1">Back to the recipe book</button>'});
  };
  const el=I.openSheet({title:"Add to my week", body:""});
  draw();
  el.onclick=e=>{
    const b=e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.aw){ wk=b.dataset.aw; if (wk===thisWk && di<U.dayIdx(U.today())) di=U.dayIdx(U.today()); draw(); return; }
    if (b.dataset.ad){ di=+b.dataset.ad; draw(); return; }
    if (b.dataset.as){ slot=b.dataset.as; draw(); return; }
    if (b.dataset.aback){ bookSheet(); return; }
    if (b.dataset.ago){ const lb=$("addLeft"); I.closeSheet(); placeRecipe(wk, di, slot, r, !!(lb && lb.checked)); }
  };
  el.onchange=e=>{ if (e.target.id==="addLeft") leftovers=e.target.checked; };
  el.oninput=null;
}

function planMenu(){
  const wk=CL.state.week, plan=CL.store.S.plans[wk], key=CL.claude.hasKey();
  const body='<button type="button" class="btn block" data-pm="shuffle">'+icon("book")+'New week from the recipe book</button>'+
    '<button type="button" class="btn block" data-pm="mine">'+icon("star")+'Start over and pick my own</button>'+
    (key? '<div class="field"><label for="planReq2">Ask Claude for something specific (optional)</label><textarea id="planReq2" rows="2" maxlength="300" placeholder="e.g. more Mexican food, cheaper meals"></textarea></div><button type="button" class="btn soft block" data-pm="claude">'+icon("sparkle")+'Have Claude write a new week</button>' : "")+
    '<button type="button" class="btn block danger" data-pm="delete">'+icon("trash")+'Delete this plan</button>'+
    '<p class="hint">A new plan replaces this week\'s meals and grocery list. Food you already logged stays logged.</p>';
  const el=I.openSheet({title:"New plan", body});
  el.onclick=e=>{
    const b=e.target.closest("[data-pm]"); if (!b) return;
    const a=b.dataset.pm;
    if (a==="shuffle"){ I.closeSheet(); buildLibrary(wk); }
    if (a==="mine"){ I.closeSheet(); startMine(wk); }
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
    '<button type="button" class="btn block" data-swbook="1">'+icon("book")+'Choose from the whole recipe book</button>'+
    (cur? '<button type="button" class="btn block danger" data-swclear="1">'+icon("x")+'Leave this meal empty</button>' : "")+
    (CL.claude.hasKey()? '<button type="button" class="btn soft block" data-claude="1">'+icon("sparkle")+'Ask Claude for something new</button>' : "");
  const el=I.openSheet({title:"Swap "+I.SLOT_MEAL[slot].toLowerCase(), body});
  el.onclick=async e=>{
    const b=e.target.closest("button"); if (!b) return;
    const S=CL.store.S, before=U.clone(plan);
    if (b.dataset.swbook){ bookSheet({wk, di, slot}); return; }
    if (b.dataset.swclear){
      S.plans[wk]=P.setSlot(plan, di, slot, null); I.closeSheet(); CL.store.changed();
      I.toast(I.SLOT_MEAL[slot]+" cleared", ()=>{ S.plans[wk]=before; CL.store.changed(); }); return;
    }
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
  if (b.dataset.build==="mine"){ startMine(st.week); return; }
  if (b.dataset.pick){ bookSheet({wk:st.week, di:st.planDay||0, slot:b.dataset.pick}); return; }
  if (b.dataset.build==="claude"){ buildClaude(st.week, ($("planReq")||{}).value? $("planReq").value.trim().slice(0,300) : ""); return; }
  if (b.dataset.stopgen){ if (gen) gen.ctl.abort(); gen=null; render(); return; }
  if (b.dataset.tabgo){ CL.app.setTab(b.dataset.tabgo); return; }
  if (b.dataset.planmenu){ planMenu(); return; }
  if (b.dataset.book){ bookSheet(); return; }
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

CL.planUI={render, onClick, onChange, logSlot, buildLibrary, bookSheet, get busy(){ return !!gen; }};
})();
