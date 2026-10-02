/* The "+" sheet: search, barcode scan, quick add, custom foods, saved meals, label and meal photos,
   plus the portion editor used for adding and editing log entries. */
window.CL = window.CL || {};
(function(){
const U=CL.util, I=CL.ui, esc=U.esc, icon=I.icon, $=I.$;
let ctx={date:null, meal:"Breakfast"};
let results=[];            // what the current list's data-pick indexes point at
let onlineQ="", online=null, onlineErr="", onlineBusy=false;
let photoMode=null;

/* ---------- Search sources ---------- */
function recipeFoods(){
  return CL.RECIPES.map(r=>({name:r.name, serving:"1 serving", kcal:r.kcal, protein:r.protein, carbs:r.carbs, fat:r.fat, fiber:r.fiber, src:"recipe"}));
}
/* Smart fast food orders (js/fastfood.js) as loggable foods. */
function fastFoods(){
  return (CL.FASTFOOD||[]).flatMap(c=>c.orders.map(o=>({name:o.name, brand:c.chain, serving:"1 order", kcal:o.kcal, protein:o.protein, carbs:o.carbs, fat:o.fat, fiber:o.fiber==null? null : o.fiber, src:"fastfood"})));
}
function matches(f, words){ const t=(f.name+" "+(f.brand||"")).toLowerCase(); return words.every(w=>t.includes(w)); }
function dedupe(list){ const seen=new Set(); return list.filter(f=>{ const k=I.foodKey(f); if (seen.has(k)) return false; seen.add(k); return true; }); }

function resultRow(f, i, tag){
  const sub=[f.brand, f.serving].filter(Boolean).join(" · ");
  return '<li><button type="button" class="res" data-pick="'+i+'"><div class="grow"><div class="nm">'+(tag? '<span class="tag">'+tag+'</span>' : "")+esc(f.name)+'</div><div class="sub">'+esc(sub)+'</div></div><span class="kc num">'+U.fmt(f.kcal)+'</span></button></li>';
}
function mealRow(m, i){
  const k=m.items.reduce((a,x)=>a+(x.kcal||0),0);
  return '<li><button type="button" class="res" data-pickmeal="'+i+'"><div class="grow"><div class="nm"><span class="tag">Meal</span>'+esc(m.name)+'</div><div class="sub">'+esc(m.items.map(x=>x.name).join(", "))+'</div></div><span class="kc num">'+U.fmt(k)+'</span></button></li>';
}

function listHTML(q){
  const S=CL.store.S, pr=S.profile;
  results=[];
  const push=(f)=>{ results.push(f); return results.length-1; };
  const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  let x="";
  if (!words.length){
    const favs=pr.favorites||[], recents=(pr.recents||[]).slice(0,15);
    if (S.meals.length) x+='<div class="group-t">Saved meals</div><ul class="results">'+S.meals.map((m,i)=>mealRow(m,i)).join("")+'</ul>';
    if (favs.length) x+='<div class="group-t">Favorites</div><ul class="results">'+favs.map(f=>resultRow(f, push(f))).join("")+'</ul>';
    if (recents.length) x+='<div class="group-t">Recent</div><ul class="results">'+recents.map(f=>resultRow(f, push(f))).join("")+'</ul>';
    if (!S.meals.length && !favs.length && !recents.length) x+='<p class="hint">Search for a food, scan a barcode, or use Quick add if you just know the calories. Foods you log show up here next time.</p>';
    return x;
  }
  const meals=S.meals.map((m,i)=>[m,i]).filter(([m])=>matches({name:m.name}, words));
  const mine=dedupe([...(pr.favorites||[]), ...(pr.recents||[]), ...S.myFoods]).filter(f=>matches(f, words)).slice(0,15);
  const common=CL.FOODS.filter(f=>matches(f, words)).slice(0,10);
  const recipes=recipeFoods().filter(f=>matches(f, words)).slice(0,6);
  const eatOut=fastFoods().filter(f=>matches(f, words)).slice(0,8);
  if (meals.length) x+='<div class="group-t">Saved meals</div><ul class="results">'+meals.map(([m,i])=>mealRow(m,i)).join("")+'</ul>';
  if (mine.length) x+='<div class="group-t">Your foods</div><ul class="results">'+mine.map(f=>resultRow(f, push(f))).join("")+'</ul>';
  if (common.length) x+='<div class="group-t">Common foods</div><ul class="results">'+common.map(f=>resultRow(f, push(f))).join("")+'</ul>';
  if (eatOut.length) x+='<div class="group-t">Eating out</div><ul class="results">'+eatOut.map(f=>resultRow(f, push(f))).join("")+'</ul>';
  if (recipes.length) x+='<div class="group-t">Recipes</div><ul class="results">'+recipes.map(f=>resultRow(f, push(f), "Recipe")).join("")+'</ul>';
  // Online results (branded foods)
  if (onlineBusy && onlineQ===q) x+='<div class="loading"><span class="spinner"></span>Searching food databases…</div>';
  else if (online && onlineQ===q){
    x+='<div class="group-t">Online</div>'+(online.length? '<ul class="results">'+online.map(f=>resultRow(f, push(f), f.src==="usda"? "USDA" : "")).join("")+'</ul>' : '<p class="hint">No matches online. Try fewer words, scan the barcode, or create the food.</p>');
  } else if (onlineErr && onlineQ===q) x+='<p class="notice">'+esc(onlineErr)+'</p>';
  else x+='<button type="button" class="btn block" data-online="1">'+icon("search")+'Search online for “'+esc(q)+'”</button>';
  if (!mine.length && !common.length && !recipes.length && !meals.length && !eatOut.length && !online) x='<p class="hint">Nothing saved matches “'+esc(q)+'”.</p>'+x;
  return x;
}

function mealPicker(){
  return '<div class="mealpick" role="group" aria-label="Meal">'+I.MEALS.map(m=>'<button type="button" data-meal="'+m+'" aria-pressed="'+(m===ctx.meal)+'">'+m+'</button>').join("")+'</div>';
}

/* ---------- Main sheet ---------- */
function open(opts){
  opts=opts||{};
  ctx={date:opts.date||CL.state.date||U.today(), meal:opts.meal||I.guessMeal()};
  online=null; onlineQ=""; onlineErr="";
  showSearch("");
}
function showSearch(q){
  const key=CL.claude.hasKey();
  const body=mealPicker()+
    '<div class="quick">'+
      '<button type="button" data-act="scan">'+icon("scan")+'Scan</button>'+
      '<button type="button" data-act="quick">'+icon("hash")+'Quick add</button>'+
      '<button type="button" data-act="label">'+icon("camera")+'Label photo</button>'+
      '<button type="button" data-act="mealphoto">'+icon("sparkle")+'Meal photo</button>'+
    '</div>'+
    '<form class="searchbox" id="addSearch"><input type="search" id="addQ" placeholder="Search foods" value="'+esc(q)+'" autocomplete="off" enterkeyhint="search" aria-label="Search foods"></form>'+
    ((CL.FASTFOOD||[]).length? '<button type="button" class="card bookcta eatcta" data-act="eatout">'+icon("cart")+'<span class="grow"><b>Eating out?</b><span class="hint">Smart orders at '+CL.FASTFOOD.length+' chains, from their official nutrition info</span></span>'+icon("right")+'</button>' : "")+
    '<div id="addList">'+listHTML(q)+'</div>'+
    '<button type="button" class="btn block" data-act="create">'+icon("pen")+'Create a food from its label</button>'+
    (key? "" : '<p class="fine">Label and meal photos use Claude. Add your Anthropic API key under Me → Settings to turn them on.</p>');
  const el=I.openSheet({title:"Add to "+ctx.meal.toLowerCase(), body});
  wireSearch(el);
}
function refreshList(){ const q=($("addQ")||{}).value||""; const l=$("addList"); if (l) l.innerHTML=listHTML(q.trim()); }

function wireSearch(el){
  el.oninput=e=>{ if (e.target.id==="addQ") refreshList(); };
  el.onsubmit=e=>{ e.preventDefault(); const q=$("addQ").value.trim(); if (q) searchOnline(q); $("addQ").blur(); };
  el.onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.meal){ ctx.meal=b.dataset.meal; I.setSheet({title:"Add to "+ctx.meal.toLowerCase()}); el.querySelectorAll("[data-meal]").forEach(x=>x.setAttribute("aria-pressed", x===b)); return; }
    if (b.dataset.pick){ portion(results[+b.dataset.pick]); return; }
    if (b.dataset.pickmeal){ savedMeal(+b.dataset.pickmeal); return; }
    if (b.dataset.online){ searchOnline($("addQ").value.trim()); return; }
    const a=b.dataset.act;
    if (a==="scan") openScanner();
    else if (a==="quick") quickAdd();
    else if (a==="create") createFood({});
    else if (a==="label" || a==="mealphoto") startPhoto(a);
    else if (a==="eatout") eatingOut();
  };
}

/* ---------- Eating out ---------- */
let eatChain=null;
function eatingOut(){
  const chains=CL.FASTFOOD||[];
  if (!eatChain || !chains.some(c=>c.chain===eatChain)) eatChain=chains[0] && chains[0].chain;
  const draw=()=>{
    const c=chains.find(x=>x.chain===eatChain);
    I.setSheet({body:
      '<div class="filters" role="group" aria-label="Restaurant">'+chains.map(x=>'<button type="button" data-chain="'+esc(x.chain)+'" aria-pressed="'+(x.chain===eatChain)+'">'+esc(x.chain)+'</button>').join("")+'</div>'+
      (c? '<ul class="results">'+c.orders.map((o,i)=>'<li><button type="button" class="res" data-order="'+i+'"><div class="grow"><div class="nm">'+esc(o.name)+'</div><div class="sub">'+esc(o.parts||"")+'</div><div class="sub num">'+o.protein+' g protein · '+o.carbs+' g carbs · '+o.fat+' g fat</div></div><span class="kc num">'+U.fmt(o.kcal)+'</span></button></li>').join("")+'</ul>'+
        (c.tip? '<p class="tip notice info"><b>Tip:</b> '+esc(c.tip)+'</p>' : "")+
        '<p class="fine">From '+esc(c.chain)+'\'s published nutrition info'+(c.checked? " ("+esc(c.checked)+")" : "")+'. Menus and recipes change, so treat these as close estimates.</p>' : "")+
      '<button type="button" class="btn block" data-eback="1">'+icon("left")+'Back to search</button>'});
  };
  const el=I.openSheet({title:"Eating out", body:""});
  draw();
  el.onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.chain){ eatChain=b.dataset.chain; draw(); const p=$("sheetBody").querySelector('[aria-pressed="true"]'); if (p) p.scrollIntoView({inline:"center", block:"nearest"}); return; }
    if (b.dataset.order){
      const c=chains.find(x=>x.chain===eatChain), o=c.orders[+b.dataset.order];
      portion({name:o.name, brand:c.chain, serving:"1 order", kcal:o.kcal, protein:o.protein, carbs:o.carbs, fat:o.fat, fiber:o.fiber==null? null : o.fiber, src:"fastfood"});
      return;
    }
    if (b.dataset.eback){ showSearch(""); }
  };
  el.oninput=null; el.onsubmit=null;
}

async function searchOnline(q){
  if (!q) return;
  onlineQ=q; onlineBusy=true; online=null; onlineErr=""; refreshList();
  try { online=(await CL.foodapi.search(q)).slice(0,25); }
  catch(e){ onlineErr=CL.foodapi.errorText(e); }
  onlineBusy=false;
  if (($("addQ")||{}).value!==undefined && $("addQ").value.trim()===q) refreshList();
}

/* ---------- Portion editor ---------- */
function amountUnits(food){
  const u=[["serving", food.serving? "× "+food.serving : "servings"]];
  if (food.per100) u.push(["g", food.base==="ml"? "ml" : "grams"]);
  return u;
}
function computeFor(food, amount, unit){
  if (unit==="g" && food.per100){
    const k=amount/100, p=food.per100, r=v=>v==null? null : Math.round(v*k*10)/10;
    return {kcal:Math.round(p.kcal*k), protein:r(p.protein)||0, carbs:r(p.carbs)||0, fat:r(p.fat)||0, fiber:r(p.fiber)};
  }
  return I.scaleFood(food, amount);
}
function nutGrid(n){
  return '<div class="nutgrid num"><div><b>'+U.fmt(n.kcal)+'</b><span>kcal</span></div><div><b>'+U.g1(n.protein)+'</b><span>Protein</span></div><div><b>'+U.g1(n.carbs)+'</b><span>Carbs</span></div><div><b>'+U.g1(n.fat)+'</b><span>Fat</span></div><div><b>'+(n.fiber==null? "–" : U.g1(n.fiber))+'</b><span>Fiber</span></div></div>';
}

/* food: the thing being added (per one serving). edit: {date, id} when changing an existing entry. */
function portion(food, edit){
  if (!food) return;
  let unit="serving", amount=edit? edit.servings : 1;
  if (edit && edit.meal) ctx.meal=edit.meal;
  const units=amountUnits(food);
  const fav=I.isFavorite(food);
  const draw=()=>{
    const n=computeFor(food, amount, unit);
    const grid=$("pgrid"); if (grid) grid.innerHTML=nutGrid(n);
  };
  const body=
    '<div class="foodcard"><div><div class="nm">'+esc(food.name)+'</div><div class="br">'+esc([food.brand, food.serving? "Per "+food.serving : ""].filter(Boolean).join(" · "))+'</div></div><div id="pgrid"></div>'+
    (food.src==="photo"? '<p class="hint">Read from a photo by Claude. Double-check against the label.</p>' : "")+
    (food.src==="off"? '<p class="hint">From Open Food Facts, a crowd-sourced database. Check the label if something looks off.</p>' : "")+'</div>'+
    '<div class="field"><span class="lbl">Amount</span><div class="stepper"><button type="button" class="iconbtn" data-step="-1" aria-label="Less">−</button>'+
    '<input type="number" id="pAmt" inputmode="decimal" step="any" min="0" value="'+U.g1(amount)+'" aria-label="Amount">'+
    '<button type="button" class="iconbtn" data-step="1" aria-label="More">'+icon("plus")+'</button>'+
    (units.length>1? '<select id="pUnit" aria-label="Unit" style="flex:1">'+units.map(([v,l])=>'<option value="'+v+'">'+esc(l)+'</option>').join("")+'</select>' : '<span class="hint grow">'+esc(units[0][1])+'</span>')+
    '</div></div>'+
    mealPicker();
  const foot=(edit? '<button type="button" class="btn danger" data-p="delete">'+icon("trash")+'Remove</button><button type="button" class="btn primary" data-p="save">Save</button>'
    : '<button type="button" class="btn" data-p="fav" aria-pressed="'+fav+'" style="flex:0 0 auto">'+icon("star")+(fav? "Saved" : "Favorite")+'</button><button type="button" class="btn primary" data-p="add">Add to '+ctx.meal.toLowerCase()+'</button>');
  const el=I.openSheet({title:edit? "Edit entry" : "How much?", body, foot});
  draw();
  const amt=$("pAmt");
  amt.oninput=()=>{ const v=U.num(amt.value); amount=Number.isFinite(v)&&v>=0? v : 0; draw(); };
  if ($("pUnit")) $("pUnit").onchange=e=>{
    const nu=e.target.value;
    if (nu==="g" && unit!=="g"){ amount=Math.round((food.servingG||100)*amount); }
    else if (nu==="serving" && unit==="g"){ amount=Math.round(amount/(food.servingG||100)*4)/4 || 1; }
    unit=nu; amt.value=U.g1(amount); amt.step = unit==="g"? "1" : "any"; draw();
  };
  el.onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.step){
      const st = unit==="g"? 10 : amount<1 || (amount===1 && +b.dataset.step<0)? 0.25 : 0.5;
      amount=Math.max(0, Math.round((amount + st*(+b.dataset.step))*100)/100); amt.value=U.g1(amount); draw(); return;
    }
    if (b.dataset.meal){ ctx.meal=b.dataset.meal; el.querySelectorAll("[data-meal]").forEach(x=>x.setAttribute("aria-pressed", x===b)); const add=document.querySelector('[data-p="add"]'); if (add) add.textContent="Add to "+ctx.meal.toLowerCase(); return; }
  };
  $("sheetFoot").onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    const p=b.dataset.p;
    if (p==="fav"){ const on=I.toggleFavorite(food); b.setAttribute("aria-pressed", on); b.innerHTML=icon("star")+(on? "Saved" : "Favorite"); return; }
    if (p==="delete"){ I.closeSheet(); I.removeEntry(edit.date, edit.id); return; }
    if (!(amount>0)){ amt.focus(); return; }
    let f=food, s=amount;
    if (unit==="g"){                     // log "150 g" as one serving of that size
      const n=computeFor(food, amount, "g");
      f=Object.assign({}, food, n, {serving:Math.round(amount)+" "+(food.base==="ml"? "ml" : "g"), servingG:amount}); s=1;
    }
    if (p==="save"){
      const d=CL.store.day(edit.date), e2=d.entries.find(x=>x.id===edit.id);
      if (e2){ Object.assign(e2, I.scaleFood(f, s), {servings:s, serving:f.serving, meal:ctx.meal, food:I.foodSnapshot(f)}); CL.store.changed(); }
      I.closeSheet(); I.toast("Updated"); return;
    }
    if (p==="add"){
      if (["off","usda","photo","custom"].includes(food.src)) I.saveMyFood(food);
      I.addEntry(ctx.date, f, s, ctx.meal);
      I.closeSheet();
      I.toast("Added "+f.name+" · "+U.fmt(I.scaleFood(f,s).kcal)+" kcal");
    }
  };
  setTimeout(()=>{ try { amt.focus({preventScroll:true}); amt.select(); } catch(e){} }, 260);
}

function editEntry(date, id){
  const e=CL.store.peekDay(date).entries.find(x=>x.id===id); if (!e) return;
  ctx={date, meal:e.meal};
  const s=e.servings||1;
  const food=e.food? Object.assign({}, e.food) : {name:e.name, brand:e.brand, serving:e.serving, kcal:e.kcal/s, protein:e.protein/s, carbs:e.carbs/s, fat:e.fat/s, fiber:e.fiber==null? null : e.fiber/s};
  food.name=e.name;
  portion(food, {date, id, servings:s, meal:e.meal});
}

/* ---------- Saved meals ---------- */
function savedMeal(i){
  const m=CL.store.S.meals[i]; if (!m) return;
  let mult=1;
  const total=()=>m.items.reduce((a,x)=>a+(x.kcal||0),0)*mult;
  const body='<div class="foodcard"><div class="nm">'+esc(m.name)+'</div><ul class="results">'+m.items.map(x=>'<li class="res" style="cursor:default"><div class="grow"><div class="nm">'+esc(x.name)+'</div><div class="sub">'+esc((x.servings!==1? U.g1(x.servings)+" × " : "")+(x.serving||""))+'</div></div><span class="kc num">'+U.fmt(x.kcal)+'</span></li>').join("")+'</ul></div>'+
    '<div class="field"><span class="lbl">Portion of the whole meal</span><div class="stepper"><button type="button" class="iconbtn" data-step="-1">−</button><input type="number" id="mMult" step="any" value="1" inputmode="decimal" aria-label="Portion"><button type="button" class="iconbtn" data-step="1">'+icon("plus")+'</button><span class="hint grow" id="mTot"></span></div></div>'+
    mealPicker()+'<button type="button" class="linkbtn" data-delmeal="1" style="justify-self:start;color:var(--stop)">Delete this saved meal</button>';
  const el=I.openSheet({title:"Saved meal", body, foot:'<button type="button" class="btn primary" data-p="add">Add to '+ctx.meal.toLowerCase()+'</button>'});
  const upd=()=>{ $("mTot").textContent=U.fmt(total())+" kcal"; };
  upd();
  $("mMult").oninput=e=>{ const v=U.num(e.target.value); mult=v>0? v : 0; upd(); };
  el.onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.step){ mult=Math.max(0.25, Math.round((mult+0.25*(+b.dataset.step))*100)/100); $("mMult").value=U.g1(mult); upd(); }
    if (b.dataset.meal){ ctx.meal=b.dataset.meal; el.querySelectorAll("[data-meal]").forEach(x=>x.setAttribute("aria-pressed", x===b)); $("sheetFoot").querySelector("button").textContent="Add to "+ctx.meal.toLowerCase(); }
    if (b.dataset.delmeal && confirm("Delete “"+m.name+"”?")){ CL.store.S.meals.splice(i,1); CL.store.changed(); showSearch(""); }
  };
  $("sheetFoot").onclick=()=>{
    if (!(mult>0)) return;
    for (const x of m.items){
      const s=x.servings||1;
      const base=x.food || {name:x.name, brand:x.brand, serving:x.serving, kcal:x.kcal/s, protein:x.protein/s, carbs:x.carbs/s, fat:x.fat/s, fiber:x.fiber==null? null : x.fiber/s};
      I.addEntry(ctx.date, Object.assign({}, base, {name:x.name}), s*mult, ctx.meal);
    }
    I.closeSheet(); I.toast("Added "+m.name+" · "+U.fmt(total())+" kcal");
  };
}

/* ---------- Quick add ---------- */
function quickAdd(){
  const body='<p class="hint">Know the calories but not the food? Just log the number. Macros are optional.</p>'+
    '<div class="fgrid"><div class="field full"><label for="qkK">Calories</label><input id="qkK" type="number" inputmode="numeric" placeholder="e.g. 350"></div>'+
    '<div class="field full"><label for="qkN">What was it? (optional)</label><input id="qkN" type="text" maxlength="90" placeholder="Quick add"></div>'+
    '<div class="field"><label for="qkP">Protein g</label><input id="qkP" type="number" inputmode="decimal"></div>'+
    '<div class="field"><label for="qkC">Carbs g</label><input id="qkC" type="number" inputmode="decimal"></div>'+
    '<div class="field"><label for="qkF">Fat g</label><input id="qkF" type="number" inputmode="decimal"></div></div>'+mealPicker();
  const el=I.openSheet({title:"Quick add", body, foot:'<button type="button" class="btn" data-p="back">Back</button><button type="button" class="btn primary" data-p="add">Add</button>'});
  el.onclick=e=>{ const b=e.target.closest("[data-meal]"); if (b){ ctx.meal=b.dataset.meal; el.querySelectorAll("[data-meal]").forEach(x=>x.setAttribute("aria-pressed", x===b)); } };
  $("sheetFoot").onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.p==="back"){ showSearch(""); return; }
    const k=U.num($("qkK").value); if (!(k>0)){ $("qkK").focus(); return; }
    const v=id=>{ const n=U.num($(id).value); return n>0? n : 0; };
    I.addEntry(ctx.date, {name:$("qkN").value.trim()||"Quick add", serving:"", kcal:k, protein:v("qkP"), carbs:v("qkC"), fat:v("qkF"), fiber:null, src:"quick"}, 1, ctx.meal);
    I.closeSheet(); I.toast("Added "+U.fmt(k)+" kcal");
  };
  setTimeout(()=>{ try { $("qkK").focus(); } catch(e){} }, 260);
}

/* ---------- Create / fix a food from its label ---------- */
function createFood(pre, note){
  pre=pre||{};
  const key=CL.claude.hasKey();
  const val=v=>v==null || v===""? "" : esc(String(v));
  const body=(note? '<p class="notice info">'+esc(note)+'</p>' : "")+
    (key? '<button type="button" class="btn block soft" data-act="label">'+icon("camera")+'Fill in from a photo of the label</button>' : "")+
    '<div class="fgrid">'+
    '<div class="field full"><label for="cfN">Name</label><input id="cfN" type="text" maxlength="90" value="'+val(pre.name)+'" placeholder="e.g. Protein bar, chocolate"></div>'+
    '<div class="field"><label for="cfB">Brand</label><input id="cfB" type="text" maxlength="60" value="'+val(pre.brand)+'"></div>'+
    '<div class="field"><label for="cfS">Serving size</label><input id="cfS" type="text" maxlength="60" value="'+val(pre.serving)+'" placeholder="1 bar (60 g)"></div>'+
    '<div class="field full"><label for="cfK">Calories per serving</label><input id="cfK" type="number" inputmode="numeric" value="'+val(pre.kcal)+'"></div>'+
    '<div class="field"><label for="cfP">Protein g</label><input id="cfP" type="number" inputmode="decimal" value="'+val(pre.protein)+'"></div>'+
    '<div class="field"><label for="cfC">Carbs g</label><input id="cfC" type="number" inputmode="decimal" value="'+val(pre.carbs)+'"></div>'+
    '<div class="field"><label for="cfF">Fat g</label><input id="cfF" type="number" inputmode="decimal" value="'+val(pre.fat)+'"></div>'+
    '<div class="field"><label for="cfFi">Fiber g</label><input id="cfFi" type="number" inputmode="decimal" value="'+val(pre.fiber)+'"></div>'+
    '<div class="field full"><label for="cfBc">Barcode (optional)</label><input id="cfBc" type="text" inputmode="numeric" value="'+val(pre.barcode)+'"></div></div>'+
    '<p class="err" id="cfErr" hidden></p>';
  const el=I.openSheet({title:"Create food", body, foot:'<button type="button" class="btn" data-p="back">Back</button><button type="button" class="btn primary" data-p="save">Save and log</button>'});
  el.onclick=e=>{ const b=e.target.closest("[data-act]"); if (b && b.dataset.act==="label") startPhoto("label"); };
  $("sheetFoot").onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.p==="back"){ showSearch(""); return; }
    const name=$("cfN").value.trim(), kcal=U.num($("cfK").value);
    const err=m=>{ $("cfErr").textContent=m; $("cfErr").hidden=false; };
    if (!name) return err("Give the food a name.");
    if (!(kcal>=0)) return err("Enter the calories per serving from the label.");
    const v=id=>{ const n=U.num($(id).value); return n>=0? n : 0; };
    const fiberRaw=U.num($("cfFi").value);
    const food={name, brand:$("cfB").value.trim(), serving:$("cfS").value.trim()||"1 serving", kcal:Math.round(kcal), protein:v("cfP"), carbs:v("cfC"), fat:v("cfF"),
      fiber:Number.isFinite(fiberRaw)? fiberRaw : null, barcode:CL.foodapi.digits($("cfBc").value)||null, src:pre.src==="photo"? "photo" : "custom"};
    I.saveMyFood(food);
    portion(food);
  };
}

/* ---------- Barcode scanner ---------- */
let scanning=false;
function openScanner(){
  const box=$("scanner");
  box.hidden=false; $("scanErr").hidden=true; $("scanReticle").hidden=false; $("scanCode").value="";
  $("scanStatus").textContent="Starting the camera…";
  scanning=true;
  CL.scanner.scan($("scanVideo"), t=>{ $("scanStatus").textContent=t; $("scanTorch").hidden=!CL.scanner.torchSupported(); })
    .then(code=>{ if (scanning) gotCode(code); })
    .catch(e=>{
      if (!scanning || e.code==="cancelled") return;
      $("scanReticle").hidden=true;
      $("scanErr").innerHTML='<b>Camera problem</b><p class="hint" style="color:inherit">'+esc(CL.scanner.errorText(e))+'</p>';
      $("scanErr").hidden=false; $("scanStatus").textContent="";
    });
}
function closeScanner(){ scanning=false; CL.scanner.stop(); $("scanner").hidden=true; $("scanVideo").srcObject=null; }

async function gotCode(raw){
  const code=CL.foodapi.digits(raw);
  closeScanner();
  if (!code) return;
  const known=I.myFoodByBarcode(code);
  if (known){ portion(known); return; }
  I.openSheet({title:"Looking it up", body:'<div class="loading"><span class="spinner"></span>Looking up barcode '+esc(code)+'…</div>'});
  try {
    const r=await CL.foodapi.lookupBarcode(code);
    if (r.food){ portion(r.food); return; }
    if (r.incomplete){ createFood(Object.assign({}, r.incomplete, {barcode:code}), "Found “"+(r.incomplete.name||"this product")+"” but it's missing nutrition info. Copy it from the label once and the app will remember it."); return; }
    createFood({barcode:code}, "This barcode isn't in the free food databases yet. Add it from the label once and it'll be remembered next time you scan it.");
  } catch(e){
    createFood({barcode:code}, CL.foodapi.errorText(e));
  }
}

/* ---------- Photos (Claude) ---------- */
function startPhoto(kind){
  if (!CL.claude.hasKey()){
    I.openSheet({title:"Photo logging", body:'<p>Reading labels and estimating meals from photos uses Claude, with your own Anthropic API key. Each photo costs about 1–3 cents.</p><button type="button" class="btn primary block" id="goKey">Add an API key</button><button type="button" class="btn block" id="goBack">Back</button>'});
    $("goKey").onclick=()=>{ I.closeSheet(); CL.app.setTab("me"); setTimeout(()=>{ const k=$("apiKey"); if (k){ k.scrollIntoView({block:"center"}); k.focus(); } }, 300); };
    $("goBack").onclick=()=>showSearch("");
    return;
  }
  photoMode=kind;
  const inp=$("photoInput"); inp.value=""; inp.click();
}
async function onPhoto(file){
  if (!file) return;
  if (photoMode==="label"){
    const hint=($("cfN")||{}).value||"", barcode=($("cfBc")||{}).value||null;      // keep what was typed before the sheet changes
    I.openSheet({title:"Reading the label", body:'<div class="loading"><span class="spinner"></span>Claude is reading the nutrition label…</div><p class="hint">Usually takes 5–15 seconds.</p>'});
    try {
      const f=await CL.claude.readLabel(file, hint);
      createFood(Object.assign({barcode}, f), "Read by Claude. Check the numbers against the label, then save.");
    } catch(e){ createFood({name:hint, barcode}, CL.claude.errorText(e)); }
  } else {
    I.openSheet({title:"Estimating your meal", body:'<div class="loading"><span class="spinner"></span>Claude is estimating what\'s on the plate…</div><p class="hint">Usually takes 10–20 seconds.</p>'});
    try { mealEstimate(await CL.claude.estimateMeal(file)); }
    catch(e){ I.setSheet({title:"Meal photo", body:'<p class="notice">'+esc(CL.claude.errorText(e))+'</p><button type="button" class="btn block" id="goBack">Back</button>'}); $("goBack").onclick=()=>showSearch(""); }
  }
}
function mealEstimate(est){
  const items=est.items.map(x=>Object.assign({on:true}, x));
  const body='<p class="notice info">Photo estimates can be off by 20% or more, mostly from oil and sauces you can\'t see. Adjust anything that looks wrong.</p>'+
    (est.note? '<p class="hint">'+esc(est.note)+'</p>' : "")+
    '<ul class="results">'+items.map((x,i)=>'<li><label class="res"><input type="checkbox" data-on="'+i+'" checked style="width:20px;height:20px;accent-color:var(--accent)"><div class="grow"><div class="nm">'+esc(x.name)+'</div><div class="sub">'+esc(x.portion)+' · '+I.macroText(x)+'</div></div>'+
      '<input type="number" inputmode="numeric" data-k="'+i+'" value="'+x.kcal+'" style="width:84px;text-align:right" aria-label="Calories for '+esc(x.name)+'"></label></li>').join("")+'</ul>'+mealPicker();
  const el=I.setSheet({title:est.name, body, foot:'<button type="button" class="btn" data-p="back">Back</button><button type="button" class="btn primary" data-p="add">Add to log</button>'});
  const sb=$("sheetBody");
  sb.oninput=e=>{
    const t=e.target;
    if (t.dataset.on) items[+t.dataset.on].on=t.checked;
    if (t.dataset.k){ const x=items[+t.dataset.k], v=U.num(t.value); if (v>=0 && x.kcal>0){ const k=v/x.kcal; x.protein*=k; x.carbs*=k; x.fat*=k; } x.kcal=v>=0? v : 0; }
  };
  sb.onclick=e=>{ const b=e.target.closest("[data-meal]"); if (b){ ctx.meal=b.dataset.meal; sb.querySelectorAll("[data-meal]").forEach(x=>x.setAttribute("aria-pressed", x===b)); } };
  $("sheetFoot").onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.p==="back"){ showSearch(""); return; }
    const chosen=items.filter(x=>x.on && x.kcal>0);
    if (!chosen.length) return;
    for (const x of chosen) I.addEntry(ctx.date, {name:x.name, serving:x.portion, kcal:Math.round(x.kcal), protein:Math.round(x.protein), carbs:Math.round(x.carbs), fat:Math.round(x.fat), fiber:null, src:"photo-meal"}, 1, ctx.meal);
    I.closeSheet(); I.toast("Added "+chosen.length+" items · "+U.fmt(chosen.reduce((a,x)=>a+x.kcal,0))+" kcal");
  };
}

function init(){
  $("scanClose").onclick=closeScanner;
  $("scanTorch").onclick=(()=>{ let on=false; return ()=>{ on=!on; CL.scanner.setTorch(on); }; })();
  $("scanManual").onsubmit=e=>{ e.preventDefault(); const c=CL.foodapi.digits($("scanCode").value); if (c.length>=6) gotCode(c); };
  $("photoInput").onchange=e=>onPhoto(e.target.files && e.target.files[0]);
  document.addEventListener("visibilitychange", ()=>{ if (document.hidden && scanning) closeScanner(); });
}

CL.add={open, editEntry, portion, openScanner, closeScanner, init, createFood};
})();
