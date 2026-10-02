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

/* ---------- Type several foods at once ---------- */
const QTY_WORDS={a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, half:0.5, "½":0.5, "¼":0.25};
const SKIP_WORDS=new Set(["of","cup","cups","slice","slices","piece","pieces","tbsp","tsp","oz","scoop","scoops","serving","servings","bowl","glass","small","medium","large","some","with"]);
const SYNONYMS={toast:"bread", oj:"orange juice", pb:"peanut butter", shake:"protein shake", fries:"french fries", coke:"cola", yoghurt:"yogurt"};
let multi=[];
/* "a drizzle of honey", "a layer of yogurt": everyday amounts, in tablespoons */
const PORTION_WORDS={drizzle:0.33, drizzled:0.33, pat:0.33, splash:1, sprinkle:1, sprinkled:1, spoonful:1, spoon:1, smear:1, dollop:2, spread:1.5, layer:4, handful:8, scoop:null};
/* About how many tablespoons one serving is: its volume, or its weight (about 15 g or ½ oz per tbsp). */
function servingTbsp(food){
  const v=servingVolTbsp(food.serving); if (v) return v;
  const g=servingGrams(food); if (g) return g/15;
  const oz=/(\d+(?:\.\d+)?)\s*oz\b/i.exec(food.serving||""); return oz? +oz[1]*2 : null;
}
function volText(tbsp){
  if (tbsp<1) return Math.max(1, Math.round(tbsp*3))+" tsp";
  if (tbsp<4) return U.frac(Math.round(tbsp*2)/2)+" tbsp";
  return U.frac(Math.round(tbsp/16*4)/4)+" cup";
}
function norm(w){ return w.toLowerCase().replace(/[^a-z0-9½¼]/g,"").replace(/ies$/,"y").replace(/([^s])s$/,"$1"); }
function splitItems(q){
  const out=[];
  for (const part of q.split(/\s*(?:,|\+|;|\n)\s*/).map(t=>t.trim()).filter(Boolean)){
    const ps=part.split(/\s+(?:and|&)\s+/i).map(t=>t.trim()).filter(Boolean).map(parseItem);
    const lead=ps[0];
    if (ps.length>1 && lead.vol){                 // one handful of two things: split it between them
      const share=ps.filter((p,i)=>i===0 || (!p.vol && !p.hasQty));
      const v=lead.vol;
      share.forEach(p=>{ p.vol=v/share.length; p.pword=lead.pword; p.qty=lead.qty; p.shared=share.length; });
    }
    out.push(...ps);
  }
  return out.length>=2 || (out.length===1 && out[0].vol)? out : null;
}
function parseItem(text){
  let t=text.toLowerCase().trim(), qty=1, hasQty=false;
  const m=t.match(/^(\d+\/\d+|\d+(?:\.\d+)?|½|¼|a|an|one|two|three|four|five|six|half)(?=\s|$)\s*(?:a\s+|an\s+)?/);
  if (m){ hasQty=true; const v=m[1]; qty= QTY_WORDS[v]!=null? QTY_WORDS[v] : v.includes("/")? (+v.split("/")[0])/(+v.split("/")[1]) : +v; t=t.slice(m[0].length); }
  const x=t.match(/\s*x\s*(\d+(?:\.\d+)?)$/); if (x){ hasQty=true; qty*=+x[1]; t=t.slice(0, x.index); }
  let vol=null, pword=null;
  let words=t.split(/\s+/).filter(w=>{ const k=w.replace(/[^a-z]/g,""); if (k in PORTION_WORDS){ pword=k.replace(/ed$/,""); vol=PORTION_WORDS[k]; return false; } return true; }).filter(w=>w && !SKIP_WORDS.has(w));
  words=words.flatMap(w=>(SYNONYMS[w]||w).split(" ")).map(norm).filter(Boolean);
  return {text, qty:qty>0 && qty<50? qty : 1, hasQty, words, vol, pword};
}
function bestFood(words, pool){
  if (!words.length) return null;
  let best=null, bestExtra=1e9;
  for (const f of pool){
    const toks=(f.name+" "+(f.brand||"")).split(/[\s,()\/&-]+/).map(norm).filter(Boolean);
    const ok=words.every(w=>toks.some(t=>t===w || (w.length>=4 && t.startsWith(w))));
    if (!ok) continue;
    const extra=toks.length-words.length;
    if (extra<bestExtra){ best=f; bestExtra=extra; }
  }
  return best;
}
function multiHTML(q){
  const items=splitItems(q); multi=[];
  if (!items) return "";
  const pr=CL.store.S.profile;
  const pool=dedupe([...(pr.favorites||[]), ...(pr.recents||[]), ...CL.store.S.myFoods, ...CL.FOODS, ...recipeFoods(), ...fastFoods()]);
  multi=items.map(p=>{
    const food=bestFood(p.words, pool);
    if (food && !p.vol && /^½\s/.test(food.serving||"")) p.qty*=2;      // "½ avocado" when the serving is already half of one
    let use=food;
    if (food && p.vol){                                       // "a drizzle of honey" → about 1 tsp of a 1 tbsp serving
      const st=servingTbsp(food);
      if (st){ const tb=p.vol*p.qty, k=tb/st, g=servingGrams(food); use=Object.assign({}, food, I.scaleFood(food, k), {serving:(p.shared? "part of a " : "")+p.pword+" (about "+volText(tb)+")", per100:null, servingG:g? Math.round(g*k) : null}); p.qty=1; }
    }
    return Object.assign(p, {food:use});
  });
  const found=multi.filter(m=>m.food), kcal=found.reduce((a,m)=>a+I.scaleFood(m.food, m.qty).kcal,0);
  return '<div class="group-t">Log them all</div><ul class="results multi">'+multi.map(m=>m.food
      ? '<li><div class="res static"><div class="grow"><div class="nm">'+(m.qty!==1? U.frac(m.qty)+" × " : "")+esc(m.food.name)+'</div><div class="sub">'+esc([m.food.brand, m.food.serving].filter(Boolean).join(" · "))+'</div></div><span class="kc num">'+U.fmt(I.scaleFood(m.food, m.qty).kcal)+'</span></div></li>'
      : '<li><div class="res static miss"><div class="grow"><div class="nm">“'+esc(m.text)+'”</div><div class="sub">No match. Search it on its own after.</div></div></div></li>').join("")+'</ul>'+
    (found.length? '<button type="button" class="btn primary block" data-multi="1">'+icon("plus")+'Add '+found.length+(found.length===1? " item" : " items")+' · '+U.fmt(kcal)+' kcal</button>' : "");
}

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
  const many=multiHTML(q);
  if (many) return many+'<p class="fine">Tip: separate foods with commas. Start with a number for more than one, like “2 eggs”.</p>';
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
    '<form class="searchbox" id="addSearch"><input type="search" id="addQ" placeholder="Search, or type: 2 eggs, toast, coffee" value="'+esc(q)+'" autocomplete="off" enterkeyhint="search" aria-label="Search foods"></form>'+
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
  el.onsubmit=e=>{ e.preventDefault(); const q=$("addQ").value.trim(); if (q && !splitItems(q)) searchOnline(q); $("addQ").blur(); };
  el.onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.meal){ ctx.meal=b.dataset.meal; I.setSheet({title:"Add to "+ctx.meal.toLowerCase()}); el.querySelectorAll("[data-meal]").forEach(x=>x.setAttribute("aria-pressed", x===b)); return; }
    if (b.dataset.pick){ portion(results[+b.dataset.pick]); return; }
    if (b.dataset.pickmeal){ savedMeal(+b.dataset.pickmeal); return; }
    if (b.dataset.online){ searchOnline($("addQ").value.trim()); return; }
    if (b.dataset.multi){
      const date=ctx.date, meal=ctx.meal, added=multi.filter(m=>m.food).map(m=>I.addEntry(date, m.food, m.qty, meal).id);
      const missed=multi.filter(m=>!m.food).map(m=>m.text);
      I.closeSheet();
      I.toast("Added "+added.length+(added.length===1? " item" : " items")+(missed.length? ". Not found: "+missed.join(", ") : ""), ()=>{ const d=CL.store.day(date); d.entries=d.entries.filter(e=>!added.includes(e.id)); CL.store.pruneEmptyDay(date); CL.store.changed(); });
      return;
    }
    const a=b.dataset.act;
    if (a==="scan") openScanner();
    else if (a==="quick") quickAdd();
    else if (a==="create") createFood({});
    else if (a==="label" || a==="mealphoto") startPhoto(a);
    else if (a==="eatout") eatingOut();
  };
}

/* ---------- What fits? Foods and recipes that fit what's left today ---------- */
const NOT_A_SNACK=/\b(oil|butter|beer|wine|cola|juice|coffee|soda)\b/i;
function fitScore(f, left, pLeft){
  const pd=f.protein*4/Math.max(f.kcal,1);                 // share of calories from protein
  const fill=Math.min(f.kcal/Math.max(left,1), 1);           // uses the room without going over
  const fib=(f.fiber||0)/Math.max(f.kcal,1)*12;
  return pd*(pLeft>10? 3 : 1) + fill*0.6 + fib;
}
function whatFits(opts){
  const date=(opts&&opts.date)||U.today();
  const S=CL.store.S, pr=S.profile, G=CL.math.goals(), T=CL.store.dayTotals(date);
  let meal=(opts&&opts.meal) || I.guessMeal();
  if (!(opts&&opts.meal) && meal!=="Snacks" && CL.store.peekDay(date).entries.some(e=>e.meal===meal)) meal="Snacks";   // that meal's already logged
  ctx={date, meal};
  const left=Math.round(G.goal-T.kcal), pLeft=Math.round((G.protein||0)-T.protein);
  results=[];
  const push=f=>{ results.push(f); return results.length-1; };
  const room=left>0? left : 150;                             // at or over target: show the lightest options
  const ok=f=>f && f.kcal>=30 && f.kcal<=room && !NOT_A_SNACK.test(f.name);
  const rank=list=>dedupe(list.filter(ok)).map(f=>[f, fitScore(f, room, pLeft)]).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const row=f=>'<li><button type="button" class="res" data-pick="'+push(f)+'"><div class="grow"><div class="nm">'+esc(f.name)+'</div><div class="sub">'+esc([f.brand, f.serving].filter(Boolean).join(" · "))+' · '+Math.round(f.protein)+' g protein</div></div><span class="kc num">'+U.fmt(f.kcal)+'</span></button></li>';
  const group=(t, list)=>list.length? '<div class="group-t">'+t+'</div><ul class="results">'+list.map(row).join("")+'</ul>' : "";
  const usual=rank([...(pr.favorites||[]), ...(pr.recents||[])]).slice(0,5);
  const usualKeys=new Set(usual.map(I.foodKey));
  const recipes=CL.RECIPES.map(r=>({name:r.name, serving:"1 serving", kcal:r.kcal, protein:r.protein, carbs:r.carbs, fat:r.fat, fiber:r.fiber, src:"recipe", meal:r.meal}));
  const bites=rank([...CL.FOODS, ...recipes.filter(r=>r.meal==="snack")]).filter(f=>!usualKeys.has(I.foodKey(f))).slice(0,8);
  const meals= left>=300? rank(recipes.filter(r=>r.meal!=="snack")).slice(0,5) : [];
  const out= left>=350? rank(fastFoods()).slice(0,4) : [];
  let head;
  if (left<=0) head='<p class="notice">You\'re at your target for today. If you\'re truly hungry, these are the lightest, most filling picks. A little over is fine; the week evens it out.</p>';
  else head='<div class="fitsum num"><div><b>'+U.fmt(left)+'</b><span>kcal left</span></div><div><b>'+(pLeft>0? pLeft+" g" : "Done")+'</b><span>Protein to go</span></div></div>'+
    '<p class="hint">'+(pLeft>10? "Sorted by protein per calorie, since you still have protein to go." : "Protein's covered, so these are sorted by how filling they are for the calories.")+'</p>';
  const body=head+group("Your usuals", usual)+group("Quick bites", bites)+group("Meals that fit", meals)+group("Eating out", out)+
    (!usual.length && !bites.length? '<p class="hint">Nothing fits that small a gap. A glass of water or tea is a good bridge until your next meal.</p>' : "");
  const el=I.openSheet({title:"What fits?", body});
  el.onclick=e=>{ const b=e.target.closest("[data-pick]"); if (b) portion(results[+b.dataset.pick]); };
  el.oninput=null; el.onsubmit=null;
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
/* Amount units: servings, plus cups/tbsp when the serving is a volume, and grams/oz when its weight is known. */
const VFRAC={"½":0.5,"¼":0.25,"⅓":1/3,"¾":0.75,"⅔":2/3,"⅛":0.125};
function servingVolTbsp(serving){
  const m=String(serving||"").toLowerCase().match(/(?:(\d+(?:\.\d+)?)\s*(?:(\d+)\/(\d+))?|(\d+)\/(\d+))?\s*(½|¼|⅓|¾|⅔|⅛)?\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/);
  if (!m) return null;
  let n=0;
  if (m[4]) n=+m[4]/+m[5];
  else { if (m[1]) n+=+m[1]; if (m[2]) n+=+m[2]/+m[3]; }
  if (m[6]) n+=VFRAC[m[6]];
  if (!n) n=1;
  const u=m[7];
  return n*(/^cup/.test(u)? 16 : /^t(bsp|ablespoon)/.test(u)? 1 : 1/3);
}
function servingGrams(food){
  if (food.servingG>0) return food.servingG;
  const m=String(food.serving||"").match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  return m? +m[1] : (food.per100? 100 : null);
}
function countWord(food){
  const w=(/^1\s+([a-z]+)\b/i.exec(food.serving||"")||[])[1];
  return w && !/^(cup|cups|oz|g|tbsp|tsp|serving|order|ml|medium|large|small)$/i.test(w)? w.toLowerCase() : null;
}
function fmtAmt(v){ return String(Math.round(v*100)/100); }
function plural(w, n){ return n>1 && !/s$/.test(w)? w+"s" : w; }
/* Each unit: how many of it make one serving. */
function amountUnits(food){
  const cw=countWord(food), vol=servingVolTbsp(food.serving), g=servingGrams(food), ml=food.base==="ml";
  const u=[{id:"serving", per:1, label: cw? plural(cw,2) : "servings"+(food.serving? " ("+food.serving+")" : "")}];
  if (vol){ u.push({id:"cup", per:vol/16, label:"cups"}); u.push({id:"tbsp", per:vol, label:"tbsp"}); }
  if (g){ u.push({id:"g", per:g, label:ml? "ml" : "grams"}); if (!ml) u.push({id:"oz", per:g/28.35, label:"oz"}); }
  return u;
}
function unitOf(food, id){ return amountUnits(food).find(u=>u.id===id) || amountUnits(food)[0]; }
function niceAmount(id, v){
  if (id==="g") return Math.round(v);
  if (id==="oz") return Math.round(v*2)/2;
  if (id==="cup") return Math.round(v*8)/8;
  if (id==="tbsp") return Math.round(v*2)/2;
  return Math.round(v*4)/4;
}
function amountText(food, id, v){
  if (id==="g") return Math.round(v)+(food.base==="ml"? " ml" : " g");
  if (id==="oz") return U.g1(v)+" oz";
  if (id==="cup") return U.frac(v)+" cup";
  if (id==="tbsp") return U.frac(v)+" tbsp";
  const cw=countWord(food);
  return cw? U.frac(v)+" "+plural(cw, v) : v===1? "1 serving" : U.frac(v)+" servings";
}
function computeFor(food, amount, unit){
  if (unit==="g" && food.per100){
    const k=amount/100, p=food.per100, r=v=>v==null? null : Math.round(v*k*10)/10;
    return {kcal:Math.round(p.kcal*k), protein:r(p.protein)||0, carbs:r(p.carbs)||0, fat:r(p.fat)||0, fiber:r(p.fiber)};
  }
  return I.scaleFood(food, amount/unitOf(food, unit).per);
}
/* Where a new portion starts: grams for scale users, cups for cup-sized foods, otherwise servings. */
function defaultUnit(food){
  const ids=amountUnits(food).map(u=>u.id);
  if (CL.store.S.profile.scale && ids.includes("g")) return "g";
  if (ids.includes("cup") && servingVolTbsp(food.serving)>=4) return "cup";
  if (ids.includes("tbsp")) return "tbsp";
  return "serving";
}
const CHIPS={serving:[0.5,1,1.5,2,3], cup:[0.25,1/3,0.5,2/3,0.75,1,1.5,2], tbsp:[1,2,3,4], oz:[1,2,3,4,6,8]};
function nutGrid(n){
  return '<div class="nutgrid num"><div><b>'+U.fmt(n.kcal)+'</b><span>kcal</span></div><div><b>'+U.g1(n.protein)+'</b><span>Protein</span></div><div><b>'+U.g1(n.carbs)+'</b><span>Carbs</span></div><div><b>'+U.g1(n.fat)+'</b><span>Fat</span></div><div><b>'+(n.fiber==null? "–" : U.g1(n.fiber))+'</b><span>Fiber</span></div></div>';
}

/* food: the thing being added (per one serving). edit: {date, id} when changing an existing entry. */
/* ---------- Recommended amounts ---------- */
const MEAL_SHARE={Breakfast:0.25, Lunch:0.30, Dinner:0.35, Snacks:0.10};
/* How much room this meal has: its share of the day, minus what's logged in it, never more than the day has left. */
function mealBudget(date, meal){
  const G=CL.math.goals(), T=CL.store.dayTotals(date), share=MEAL_SHARE[meal]||0.25;
  const list=CL.store.peekDay(date).entries.filter(e=>e.meal===meal);
  const used=list.reduce((a,e)=>a+(e.kcal||0),0), pUsed=list.reduce((a,e)=>a+(e.protein||0),0);
  const kcal=Math.round(G.goal*share), dayLeft=G.goal-T.kcal;
  return {kcal, used, left:Math.max(0, Math.min(kcal-used, dayLeft)), pTarget:Math.round((G.protein||0)*share), pUsed};
}
function roundServ(x, k){ return k<=60? Math.floor(x) : k<=150? Math.floor(x*4)/4 : Math.floor(x*2)/2; }
/* A sensible amount of one food for the room left. Low-protein foods leave room for a protein partner. */
function suggestAmount(food, B){
  const k=food.kcal; if (!(k>0) || B.left<30) return null;
  const pShare=(food.protein||0)*4/k;
  const target=B.left*(pShare<0.2 && B.left>k*2.5? 0.4 : 0.9), pNeed=B.pTarget-B.pUsed;
  let n= pShare>=0.3 && pNeed>=8? roundServ(Math.min(pNeed/food.protein, B.left/k, 3), k)    // protein foods: enough to reach the meal's protein
    : Math.min(4, roundServ(target/k, k));
  if (n<=0) n= k<=B.left? (k<=60? 1 : 0.5) : 0;
  if (!n) return null;
  return {amount:n, kcal:Math.round(k*n), protein:Math.round((food.protein||0)*n), partner:pShare<0.2 && B.left>k*2.5};
}
function suggestHTML(food, date, meal, unit){
  const B=mealBudget(date, meal), sg=suggestAmount(food, B), m=meal.toLowerCase();
  if (!sg) return '<div class="suggest"><b>Your '+m+' budget is used up.</b> <span class="hint">That\'s okay. This just comes out of the rest of your day.</span></div>';
  unit=unit||"serving";
  const what=amountText(food, unit, niceAmount(unit, sg.amount*unitOf(food, unit).per));
  return '<div class="suggest">'+icon("sparkle")+'<div class="grow"><b>Suggested: '+what+'</b> <span class="hint">('+U.fmt(sg.kcal)+' kcal, '+sg.protein+' g protein). '+
    'Your '+m+' has '+U.fmt(B.left)+' of '+U.fmt(B.kcal)+' kcal left'+(sg.partner? ', so this leaves room to add some protein.' : '.')+'</span></div>'+
    '<button type="button" class="btn small soft" data-sug="'+sg.amount+'">Use</button></div>';
}

/* After adding something, offer a protein partner sized to fill the rest of the meal. */
const MEAL_FIT={
  Breakfast:/egg|yogurt|cottage|protein|milk|turkey bacon|bacon|cheese|smoked salmon|peanut butter|kefir|ham/i,
  Snacks:/yogurt|cottage|protein|cheese|jerky|egg|edamame|milk|tuna|turkey|string|kefir/i
};
function pairings(date, meal, added){
  const B=mealBudget(date, meal), pNeed=B.pTarget-B.pUsed;
  if (CL.store.S.profile.pairing===false || pNeed<8 || B.left<80) return [];
  const since=U.addDays(date,-30), hist=new Map();
  for (const d of Object.keys(CL.store.S.days)){ if (d<since) continue;
    for (const e of CL.store.S.days[d].entries||[]) if (e.meal===meal && e.food){ const k=I.foodKey(e.food); const h=hist.get(k)||{f:e.food, n:0}; h.n++; hist.set(k,h); } }
  const pr=CL.store.S.profile, re=MEAL_FIT[meal];
  const mine=[...hist.values()].sort((a,b)=>b.n-a.n).map(h=>h.f);
  const lib=[...(pr.favorites||[]), ...(pr.recents||[]), ...CL.FOODS].filter(f=>!re || re.test(f.name));
  const skip=I.foodKey(added);
  return dedupe([...mine, ...lib]).filter(f=>f.kcal>0 && (f.protein||0)*4/f.kcal>=0.3 && I.foodKey(f)!==skip && !NOT_A_SNACK.test(f.name))
    .map(f=>{
      let n=Math.min(pNeed/f.protein, B.left/f.kcal, 3); n=roundServ(n, f.kcal);
      if (n<0.5 && f.kcal*0.5<=B.left) n=0.5;
      if (n<0.5) return null;
      const du=defaultUnit(f), amt=du==="g"? Math.round(n*unitOf(f,"g").per/5)*5 : niceAmount(du, n*unitOf(f, du).per);
      return {f, n, du, amt, label:amountText(f, du, amt), kcal:Math.round(f.kcal*n), protein:Math.round(f.protein*n), own:hist.has(I.foodKey(f))};
    }).filter(Boolean).sort((a,b)=>(b.own-a.own) || (b.protein-a.protein)).slice(0,3).map(x=>Object.assign(x, {mealK:B.used+x.kcal, mealP:Math.round(B.pUsed+x.protein)}));
}
function pairingSheet(date, meal, added){
  const list=pairings(date, meal, added);
  if (!list.length) return false;
  const B=mealBudget(date, meal), m=meal.toLowerCase();
  const body='<p>Your '+m+' is at <b>'+U.fmt(B.used)+' kcal</b> and <b>'+Math.round(B.pUsed)+' g protein</b> so far. Add one of these to round it out:</p>'+
    '<ul class="results">'+list.map((x,i)=>'<li><button type="button" class="res" data-pair="'+i+'"><div class="grow"><div class="nm">'+esc(x.label)+" "+esc(x.f.name)+(x.own? ' <span class="tag">Yours</span>' : "")+'</div>'+
      '<div class="sub">+'+U.fmt(x.kcal)+' kcal, +'+x.protein+' g protein → '+m+' '+U.fmt(x.mealK)+' kcal · '+x.mealP+' g protein</div></div>'+icon("plus")+'</button></li>').join("")+'</ul>'+
    '<p class="fine">Sized to fill your '+m+' budget ('+U.fmt(B.kcal)+' kcal) and get closer to about '+B.pTarget+' g protein for the meal. Tap one to adjust the amount.</p>';
  const foot='<button type="button" class="btn ghost" data-pairoff="1" style="flex:0 0 auto">Don\'t suggest</button><button type="button" class="btn primary" data-pairdone="1">Done</button>';
  I.setSheet({title:"Add some protein?", body, foot});
  const el=$("sheetBody");
  el.onclick=e=>{ const b=e.target.closest("[data-pair]"); if (!b) return; const x=list[+b.dataset.pair]; ctx={date, meal}; portion(x.f, null, {amount:x.amt, unit:x.du}); };
  el.oninput=null; el.onsubmit=null;
  $("sheetFoot").onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.pairoff){ CL.store.S.profile.pairing=false; CL.store.changed(); I.closeSheet(); I.toast("Got it. You can turn suggestions back on in Me → Settings."); return; }
    if (b.dataset.pairdone) I.closeSheet();
  };
  return true;
}

function portion(food, edit, preset){
  if (!food) return;
  const units=amountUnits(food);
  let unit=preset && preset.unit && units.some(u=>u.id===preset.unit)? preset.unit : defaultUnit(food);
  const servings=edit? edit.servings : preset && preset.amount>0 && !preset.unit? preset.amount : 1;
  let amount=preset && preset.unit===unit && preset.amount>0? preset.amount : niceAmount(unit, servings*unitOf(food, unit).per);
  if (!(amount>0)) { unit="serving"; amount=servings; }
  if (edit && edit.meal) ctx.meal=edit.meal;
  const fav=I.isFavorite(food);
  const draw=()=>{
    const n=computeFor(food, amount, unit);
    const grid=$("pgrid"); if (grid) grid.innerHTML=nutGrid(n);
    const rd=$("pRead"); if (rd){
      const sv=amount/unitOf(food, unit).per, g=servingGrams(food);
      const bits=[amountText(food, unit, amount)];
      if (unit!=="g" && unit!=="oz" && g) bits.push("about "+Math.round(sv*g)+(food.base==="ml"? " ml" : " g"));
      if ((unit==="g" || unit==="oz") && servingVolTbsp(food.serving)) bits.push("about "+amountText(food, "cup", niceAmount("cup", sv*servingVolTbsp(food.serving)/16)));
      rd.textContent=bits.join(" · ");
    }
    const ch=$("pChips"); if (ch) ch.querySelectorAll("[data-chip]").forEach(b=>b.setAttribute("aria-pressed", Math.abs(+b.dataset.chip-amount)<0.01));
  };
  const chipsHTML=()=>{ const c=CHIPS[unit]; return c? c.map(v=>'<button type="button" data-chip="'+v+'">'+(unit==="oz"? v : U.frac(v))+'</button>').join("") : ""; };
  const body=
    '<div class="foodcard"><div><div class="nm">'+esc(food.name)+'</div><div class="br">'+esc([food.brand, food.serving? "Per "+food.serving : ""].filter(Boolean).join(" · "))+'</div></div><div id="pgrid"></div>'+
    (food.src==="photo"? '<p class="hint">Read from a photo by Claude. Double-check against the label.</p>' : "")+
    (food.src==="off"? '<p class="hint">From Open Food Facts, a crowd-sourced database. Check the label if something looks off.</p>' : "")+'</div>'+
    '<div class="field"><span class="lbl">How much did you have?</span><div class="stepper"><button type="button" class="iconbtn" data-step="-1" aria-label="Less">−</button>'+
    '<input type="number" id="pAmt" inputmode="decimal" step="any" min="0" value="'+fmtAmt(amount)+'" aria-label="Amount">'+
    '<button type="button" class="iconbtn" data-step="1" aria-label="More">'+icon("plus")+'</button>'+
    (units.length>1? '<select id="pUnit" aria-label="Unit" style="flex:1">'+units.map(u=>'<option value="'+u.id+'"'+(u.id===unit? " selected" : "")+'>'+esc(u.label)+'</option>').join("")+'</select>' : '<span class="hint grow">'+esc(units[0].label)+'</span>')+
    '</div><div class="chips" id="pChips">'+chipsHTML()+'</div><p class="hint" id="pRead"></p></div>'+
    (edit || CL.store.S.profile.pairing===false? "" : '<div id="psug"></div>')+
    mealPicker();
  const foot=(edit? '<button type="button" class="btn danger" data-p="delete">'+icon("trash")+'Remove</button><button type="button" class="btn primary" data-p="save">Save</button>'
    : '<button type="button" class="btn" data-p="fav" aria-pressed="'+fav+'" style="flex:0 0 auto">'+icon("star")+(fav? "Saved" : "Favorite")+'</button><button type="button" class="btn primary" data-p="add">Add to '+ctx.meal.toLowerCase()+'</button>');
  const el=I.openSheet({title:edit? "Edit entry" : "How much?", body, foot});
  const amt=$("pAmt");
  const sug=()=>{ const p=$("psug"); if (p) p.innerHTML=suggestHTML(food, ctx.date, ctx.meal, unit); };
  const setAmount=v=>{ amount=Math.max(0, v); amt.value=fmtAmt(amount); draw(); };
  const setUnit=nu=>{
    const sv=amount/unitOf(food, unit).per;
    unit=nu; amt.step= unit==="g"? "1" : "any";
    if ($("pUnit")) $("pUnit").value=unit;
    $("pChips").innerHTML=chipsHTML();
    setAmount(niceAmount(unit, sv*unitOf(food, unit).per)); sug();
  };
  draw(); sug();
  amt.oninput=()=>{ const v=U.num(amt.value); amount=Number.isFinite(v)&&v>=0? v : 0; draw(); };
  if ($("pUnit")) $("pUnit").onchange=e=>{
    setUnit(e.target.value);
    if (e.target.value==="g" && !CL.store.S.profile.scale && !CL.store.S.profile.scaleAsked){
      CL.store.S.profile.scaleAsked=true; CL.store.changed();
      I.toast("Weighing food? Turn on Kitchen scale in Me → Settings to start in grams every time.");
    }
  };
  el.onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    if (b.dataset.step){
      const d=+b.dataset.step;
      const st = unit==="g"? 10 : unit==="oz"? 0.5 : unit==="cup"? 0.25 : unit==="tbsp"? 1 : amount<1 || (amount===1 && d<0)? 0.25 : 0.5;
      setAmount(Math.round((amount + st*d)*100)/100); return;
    }
    if (b.dataset.chip){ setAmount(+b.dataset.chip); return; }
    if (b.dataset.sug){ setAmount(niceAmount(unit, +b.dataset.sug*unitOf(food, unit).per)); return; }
    if (b.dataset.meal){ ctx.meal=b.dataset.meal; el.querySelectorAll("[data-meal]").forEach(x=>x.setAttribute("aria-pressed", x===b)); const add=document.querySelector('[data-p="add"]'); if (add) add.textContent="Add to "+ctx.meal.toLowerCase(); sug(); return; }
  };
  $("sheetFoot").onclick=e=>{
    const b=e.target.closest("button"); if (!b) return;
    const p=b.dataset.p;
    if (p==="fav"){ const on=I.toggleFavorite(food); b.setAttribute("aria-pressed", on); b.innerHTML=icon("star")+(on? "Saved" : "Favorite"); return; }
    if (p==="delete"){ I.closeSheet(); I.removeEntry(edit.date, edit.id); return; }
    if (!(amount>0)){ amt.focus(); return; }
    let f=food, s=amount;
    if (unit!=="serving"){              // log "¾ cup" or "150 g" as one serving of exactly that
      const n=computeFor(food, amount, unit), g=servingGrams(food), sv=amount/unitOf(food, unit).per;
      f=Object.assign({}, food, n, {serving:amountText(food, unit, amount), servingG: unit==="g"? amount : g? Math.round(sv*g) : null}); s=1;
    }
    if (p==="save"){
      const d=CL.store.day(edit.date), e2=d.entries.find(x=>x.id===edit.id);
      if (e2){ Object.assign(e2, I.scaleFood(f, s), {servings:s, serving:f.serving, meal:ctx.meal, food:I.foodSnapshot(f)}); CL.store.changed(); }
      I.closeSheet(); I.toast("Updated"); return;
    }
    if (p==="add"){
      if (["off","usda","photo","custom"].includes(food.src)) I.saveMyFood(food);
      const e=I.addEntry(ctx.date, f, s, ctx.meal), date=ctx.date;
      if (!pairingSheet(ctx.date, ctx.meal, food)) I.closeSheet();
      I.toast("Added "+f.name+" · "+U.fmt(I.scaleFood(f,s).kcal)+" kcal", ()=>I.removeEntry(date, e.id));
    }
  };
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
  if (kind==="mealphoto"){
    const el=I.openSheet({title:"Meal photo", body:'<p class="hint">Take a photo of the plate or bowl, from a little above. Claude lists each food with an amount, and you can fix anything before it\'s logged. About 1–3 cents a photo.</p>'+
      '<div class="field"><label for="mpDesc">What\'s in it? (optional, but much more accurate)</label><textarea id="mpDesc" rows="2" maxlength="300" placeholder="e.g. 2 rice cakes, Chobani plain yogurt, blueberries, honey"></textarea></div>'+
      '<button type="button" class="btn primary block" id="mpGo">'+icon("camera")+'Take or choose a photo</button><button type="button" class="btn block" id="goBack">Back</button>'});
    $("mpGo").onclick=()=>{ photoDesc=$("mpDesc").value.trim(); const inp=$("photoInput"); inp.value=""; inp.click(); };
    $("goBack").onclick=()=>showSearch("");
    el.oninput=null; el.onsubmit=null; el.onclick=null;
    return;
  }
  const inp=$("photoInput"); inp.value=""; inp.click();
}
let photoDesc="";
function ownFoods(){
  const pr=CL.store.S.profile;
  return dedupe([...(pr.favorites||[]), ...(pr.recents||[]), ...CL.store.S.myFoods]).filter(f=>f && f.kcal>=0 && f.src!=="photo-meal");
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
    try { mealEstimate(await CL.claude.estimateMeal(file, photoDesc, ownFoods())); }
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

CL.add={open, editEntry, portion, whatFits, mealBudget, openScanner, closeScanner, init, createFood};
})();
