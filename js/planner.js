/* Builds a week of meals from the built-in recipe library (free, works offline),
   then works out portions and a combined grocery list.
   Claude-written plans (js/claude.js) use the same plan shape, so the screens treat both the same. */
window.CL = window.CL || {};
(function(){
const U=CL.util;
const SLOT_KEYS=["breakfast","lunch","dinner","snack"];
const DAYN=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

/* Words people type in "foods to avoid" that mean an allergen group. */
const ALLERGEN_WORDS = {
  dairy:["dairy","milk","lactose","cheese","yogurt"], egg:["egg","eggs"], gluten:["gluten","wheat","celiac","coeliac"],
  peanut:["peanut","peanuts"], "tree nut":["tree nut","tree nuts","nuts","almond","almonds","cashew","walnut"],
  fish:["fish","salmon","tuna","cod"], shellfish:["shellfish","shrimp","prawn","prawns","crab","lobster"],
  soy:["soy","soya","tofu","edamame"], sesame:["sesame"]
};

function words(text){
  return String(text||"").toLowerCase().split(/[,;/\n]|\band\b|\bor\b/).map(s=>s.trim()).filter(s=>s.length>=3);
}
function stem(w){ return w.replace(/(ies)$/,"y").replace(/(es|s)$/,""); }
function recipeText(r){
  return (r.name+" "+(r.ingredients||[]).map(i=>Array.isArray(i)? i[2] : i).join(" ")).toLowerCase();
}
function mentions(r, w){
  const t=recipeText(r), s=stem(w);
  return t.includes(w) || (s.length>=3 && t.includes(s));
}

function dietOK(r, diet){
  if (!diet || diet==="any") return true;
  if (diet==="vegan") return r.diet==="vegan";
  if (diet==="vegetarian") return r.diet==="vegan" || r.diet==="vegetarian";
  if (diet==="pescatarian") return r.diet!=="any";
  return true;
}

/* Everything this person can eat, with the reasons any recipe was left out. */
function allowed(h){
  h=h||{};
  const avoid=words(h.avoid), allergens=new Set();
  for (const w of avoid) for (const [a, list] of Object.entries(ALLERGEN_WORDS)) if (list.includes(w) || list.includes(stem(w))) allergens.add(a);
  const flags=h.flags||{};
  return CL.RECIPES.filter(r=>{
    if (!dietOK(r, h.diet)) return false;
    if ((r.allergens||[]).some(a=>allergens.has(a))) return false;
    if (avoid.some(w=>!ALLERGEN_WORDS[w] && mentions(r, w))) return false;
    if (flags.pregnant && (r.tags||[]).includes("deli")) return false;
    return true;
  });
}

/* Higher is better. Protein-dense, loved foods, fiber for diabetes, quick for beginners, a little randomness for variety. */
function score(r, h, recentIds, rand){
  const loves=words(h.loves);
  let s=0;
  s += (r.protein*4/Math.max(r.kcal,1))*6;                   // ~0.3 protein share → +1.8
  s += loves.filter(w=>mentions(r,w)).length*1.5;
  if ((h.flags||{}).diabetes) s += r.fiber/6;
  if (h.skill!=="comfortable" && r.minutes>20) s -= 0.4;
  if ((h.flags||{}).bp && /soy sauce|bacon|deli|feta/.test(recipeText(r))) s -= 0.5;
  if (recentIds.has(r.id)) s -= 1.2;                          // you ate it last week
  if (r.fame) s += 0.6;                                       // popular recipes come up a bit more often
  s += rand()*1.6;
  return s;
}

/* Small seeded random so "Shuffle" gives a new week but a plan can be rebuilt the same way. */
function rng(seed){
  let a=seed>>>0;
  return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15, 1|a); t=t+Math.imul(t^t>>>7, 61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}

function pickTop(list, n, h, recent, rand, avoidIds){
  const scored=list.filter(r=>!avoidIds.has(r.id)).map(r=>({r, s:score(r,h,recent,rand)})).sort((a,b)=>b.s-a.s);
  const out=[];
  for (const {r} of scored){
    if (out.length>=n) break;
    // Keep proteins varied: no more than two dinners built on the same main ingredient.
    const main=mainProtein(r);
    if (main && out.filter(o=>mainProtein(o)===main).length>=2) continue;
    out.push(r);
  }
  for (const {r} of scored){ if (out.length>=n) break; if (!out.includes(r)) out.push(r); }
  return out;
}
function mainProtein(r){
  const t=recipeText(r);
  for (const k of ["chicken","turkey","beef","salmon","shrimp","cod","tuna","tofu","chickpea","lentil","egg"]) if (t.includes(k)) return k;
  return null;
}

/* Week template. Dinners repeat so most lunches are last night's leftovers.
   Dinner:  A B A C D C D    Lunch: L1 A B L2 C D L1   Breakfast: B1 B2 B1 B2 B1 B2 B1   Snack: S1 S2 … */
function layout(B, L, D, S){
  const dn=[D[0],D[1],D[0],D[2],D[3],D[2],D[3]];
  const ln=[L[0],D[0],D[1],L[1]||L[0],D[2],D[3],L[0]];
  return DAYN.map((_,i)=>({breakfast:B[i%2]||B[0], lunch:ln[i], dinner:dn[i], snack:S[i%2]||S[0]}));
}

function avgDay(days, byId){
  let sum=0;
  for (const d of days) for (const s of SLOT_KEYS){ const r=byId[d[s]]; if (r) sum+=r.kcal; }
  return sum/days.length;
}

/* p = output of CL.math.computePlan (or goals), h = health answers. */
function buildWeek(p, h, opts){
  opts=opts||{};
  h=h||{};
  const rand=rng(opts.seed || Date.now());
  const recent=new Set(opts.recentIds||[]);
  const ok=allowed(h);
  const byMeal=m=>ok.filter(r=>r.meal===m);
  const cook=Number(h.cookTime)||30;
  let dinners=byMeal("dinner").filter(r=>r.minutes<=cook);
  if (dinners.length<4) dinners=byMeal("dinner");
  const none=new Set();
  const D=pickTop(dinners, 4, h, recent, rand, none);
  const B=pickTop(byMeal("breakfast"), 2, h, recent, rand, none);
  const L=pickTop(byMeal("lunch"), 2, h, recent, rand, none);
  const S=pickTop(byMeal("snack"), 2, h, recent, rand, none);
  if (D.length<2 || !B.length || !L.length || !S.length) return null;
  while (D.length<4) D.push(D[D.length%2]);

  const recipes=[...new Map([...B,...L,...D,...S].map(r=>[r.id, U.clone(r)])).values()];
  const byId=Object.fromEntries(recipes.map(r=>[r.id,r]));
  const days=layout(B.map(r=>r.id), L.map(r=>r.id), D.map(r=>r.id), S.map(r=>r.id));

  const mealsKcal=(p.target||2000)-(p.flex||0);
  const avg=avgDay(days, byId);
  const factor=Math.min(2, Math.max(0.75, Math.round(mealsKcal/avg*4)/4));

  const plan={source:"library", seed:opts.seed||null, factor, household:Math.max(1, h.household||1), recipes, days, checked:{}, createdAt:Date.now()};
  finish(plan);
  const perDay=Math.round(avgDay(days, byId)*factor);
  plan.summary="Built from the recipe book: "+D.length+" dinners that turn into next-day lunches, 2 breakfasts and 2 snacks. "+
    (factor===1? "Eat one serving of each" : "Eat "+U.frac(factor)+" servings of each")+" for about "+U.fmt(perDay)+" kcal a day, leaving room for your daily treat allowance.";
  return plan;
}

/* How often each recipe is eaten and how much to cook. */
function usage(plan){
  const n={};
  for (const d of plan.days) for (const s of SLOT_KEYS){ const id=d[s]; if (id) n[id]=(n[id]||0)+1; }
  return n;
}
function finish(plan){
  const n=usage(plan), f=plan.factor||1, hh=plan.household||1;
  for (const r of plan.recipes){
    const eaten=n[r.id]||0;
    const portions=eaten*hh*f;
    let batches=Math.max(0.5, Math.ceil(portions/r.servings*2)/2);
    let freezeExtra=false;
    if ((r.tags||[]).includes("freezer") && batches<1 && eaten){ batches=1; freezeExtra=true; }
    r.eaten=eaten; r.batches=batches; r.freezeExtra=freezeExtra;
  }
  plan.grocery=grocery(plan);
  plan.prep=prepSteps(plan);
  return plan;
}

/* ---------- Grocery list ---------- */
const COUNT_UNITS=new Set(["","can","jar","bag","package","pack","block","bunch","head","clove","slice","link","scoop","pouch","container"]);
const PLURAL={cup:"cups",slice:"slices",can:"cans",clove:"cloves",jar:"jars",bag:"bags",package:"packages",pack:"packs",block:"blocks",bunch:"bunches",head:"heads",link:"links",scoop:"scoops",pouch:"pouches",container:"containers",lb:"lb",oz:"oz",g:"g",tbsp:"tbsp",tsp:"tsp"};
function unitText(u, q){ if (!u) return ""; return q>1.001? (PLURAL[u]||u) : u; }
function pluralName(name, q){
  if (q<=1.001) return name;
  if (/(s|sh|ch|x)$/.test(name.split(" (")[0])) return name;
  if (/(tomato|potato)$/.test(name.split(" (")[0])) return name.replace(/^([^(]*?)(\s*\(.*)?$/, (m,a,b)=>a+"es"+(b||""));
  return name.replace(/^([^(]*?)(\s*\(.*)?$/, (m,a,b)=>a.replace(/y$/,"ie")+"s"+(b||""));
}
function niceQty(q, unit){
  if (COUNT_UNITS.has(unit)) return Math.ceil(q-0.05);
  if (unit==="oz" || unit==="g") return unit==="g"? Math.ceil(q/10)*10 : Math.ceil(q);
  if (unit==="lb") return Math.ceil(q*4)/4;
  return Math.ceil(q*4-0.05)/4;
}
const TSP={tsp:1, tbsp:3, cup:48};
/* Convert big spoon amounts to cups so the list reads like a shopping list. */
function tidy(q, unit){
  if (unit==="tsp" && q>=6){ q=q/3; unit="tbsp"; }
  if (unit==="tbsp" && q>=8){ q=q/16; unit="cup"; }
  return [q, unit];
}
function formatItem(q, unit, name){
  [q, unit]=tidy(q, unit);
  if (unit==="spray") return name;
  const n=niceQty(q, unit);
  if (!n) return name;
  const qty = COUNT_UNITS.has(unit) || unit==="oz" || unit==="g"? String(n) : U.frac(n);
  return (qty+" "+(unit? unitText(unit, n)+" " : "")+(unit? name : pluralName(name, n))).replace(/\s+/g," ").trim();
}

function grocery(plan){
  if (plan.source!=="library") return plan.grocery||[];
  const f=plan.factor||1, hh=plan.household||1, sums=new Map(), extras=[];
  for (const r of plan.recipes){
    if (!r.eaten) continue;
    const mult = r.servings>1? r.batches : r.eaten*hh*f;        // single-serving recipes are made fresh each time
    for (const ing of r.ingredients){
      if (!Array.isArray(ing)){ if (!extras.includes(ing)) extras.push(String(ing)); continue; }   // a Claude-written swap
      let [q, unit, name, section]=ing;
      // Spoons and cups add up together (as teaspoons); "black beans (15 oz)" and "black beans" are the same thing.
      if (TSP[unit]){ q*=TSP[unit]; unit="tsp"; }
      const base=name.replace(/\s*\(.*\)/,"").toLowerCase().replace(/s$/,"");   // "egg" and "eggs" are one item
      const key=base+"|"+unit;
      const cur=sums.get(key) || {q:0, unit, name, base, section};
      cur.q+=q*mult; if (name.length>cur.name.length) cur.name=name;
      sums.set(key, cur);
    }
  }
  // Canned goods asked for in cups as well as cans: count it all as cans (about 1½ cups each).
  for (const it of [...sums.values()]){
    const can=sums.get(it.base+"|can");
    if (can && it.unit==="tsp"){ can.q+=it.q/48/1.5; sums.delete(it.base+"|tsp"); }
  }
  const out=CL.SECTIONS.map(section=>({section, items:[]}));
  for (const it of sums.values()){
    let g=out.find(x=>x.section===it.section); if (!g){ g={section:it.section, items:[]}; out.push(g); }
    g.items.push(formatItem(it.q, it.unit, it.name));
  }
  out.forEach(g=>g.items.sort((a,b)=>a.replace(/^[\d¼½¾⅓⅔⅛.\s]+/,"").localeCompare(b.replace(/^[\d¼½¾⅓⅔⅛.\s]+/,""))));
  if (extras.length) out.push({section:"Added for swaps", items:extras});
  return out.filter(g=>g.items.length);
}

/* ---------- Prep plan ---------- */
function prepSteps(plan){
  if (plan.source!=="library") return plan.prep||[];
  const byId=Object.fromEntries(plan.recipes.map(r=>[r.id,r]));
  const steps=[];
  const ahead=plan.recipes.filter(r=>r.eaten && (r.tags||[]).includes("make-ahead"));
  if (ahead.length) steps.push("Sunday: make "+ahead.map(r=>r.name.toLowerCase()).join(" and ")+" for the first half of the week (about "+ahead.reduce((a,r)=>a+r.minutes,0)+" minutes).");
  const d=plan.days;
  const pairs=[[0,"Monday"],[1,"Tuesday"],[3,"Thursday"],[4,"Friday"]];
  for (const [i, name] of pairs){
    const r=byId[d[i].dinner]; if (!r) continue;
    const next=d[i+1] && d[i+1].lunch===r.id;
    steps.push(name+": cook "+r.name.toLowerCase()+(next? ". Pack a portion straight into a container for tomorrow's lunch." : "."));
  }
  const reheat=[[2,"Wednesday"],[5,"Saturday"],[6,"Sunday"]].filter(([i])=>d.slice(0,i).some(x=>x.dinner===d[i].dinner)).map(x=>x[1]);
  if (reheat.length) steps.push(reheat.join(" and ")+": no cooking. Dinner is leftovers from earlier in the week.");
  const freezer=plan.recipes.filter(r=>r.freezeExtra);
  if (freezer.length) steps.push("Freeze the extra "+freezer.map(r=>r.name.toLowerCase()).join(" and ")+" in single portions for a no-cook night later.");
  steps.push("Keep the treat allowance for whatever you're craving. Nothing is off-limits.");
  return steps;
}

/* ---------- Swaps ---------- */
/* Replace a recipe everywhere it appears this week (one batch feeds several meals). */
function swapOptions(plan, h, slot, currentId){
  const inPlan=new Set(plan.recipes.map(r=>r.id));
  const cur=plan.recipes.find(r=>r.id===currentId);
  const meal = cur? cur.meal : slot==="lunch"? "lunch" : slot;
  const list=allowed(h).filter(r=>r.meal===meal && !inPlan.has(r.id));
  const kcal=cur? cur.kcal : 400;
  return list.sort((a,b)=>Math.abs(a.kcal-kcal)-Math.abs(b.kcal-kcal)).slice(0,6);
}
function applySwap(plan, oldId, newRecipe){
  const next=U.clone(plan);
  const r=U.clone(newRecipe);
  if (!next.recipes.some(x=>x.id===r.id)) next.recipes.push(r);
  for (const d of next.days) for (const s of SLOT_KEYS) if (d[s]===oldId) d[s]=r.id;
  const used=new Set(next.days.flatMap(d=>SLOT_KEYS.map(s=>d[s])));
  next.recipes=next.recipes.filter(x=>used.has(x.id));
  if (next.source==="library") finish(next);
  return next;
}

/* ---------- Shared helpers for the screens ---------- */
function recipeById(plan, id){ return id? (plan.recipes||[]).find(r=>r.id===id) || null : null; }
function portion(plan){ return plan.factor||1; }
function slotKcal(plan, r){ return r? Math.round(r.kcal*portion(plan)) : 0; }
function dayTotal(plan, di){
  const d=(plan.days||[])[di]||{}, t={kcal:0, protein:0, carbs:0, fat:0, fiber:0}, f=portion(plan);
  for (const s of SLOT_KEYS){ const r=recipeById(plan, d[s]); if (r){ t.kcal+=r.kcal*f; t.protein+=r.protein*f; t.carbs+=r.carbs*f; t.fat+=r.fat*f; t.fiber+=(r.fiber||0)*f; } }
  return t;
}
/* Ingredient lines for display. Library rows are structured; Claude rows are already text. */
function ingredientLines(r){
  return (r.ingredients||[]).map(i=>{
    if (!Array.isArray(i)) return String(i);
    const [q, unit, name, , note]=i;
    if (unit==="spray") return name;
    const qty=U.frac(q);
    const label=unit? qty+" "+unitText(unit, q)+" "+name : qty+" "+pluralName(name, q);
    return label+(note? ", "+note : "");
  });
}

CL.planner = {SLOT_KEYS, DAYN, allowed, buildWeek, finish, grocery, swapOptions, applySwap, recipeById, portion, slotKcal, dayTotal, ingredientLines, usage};
})();
