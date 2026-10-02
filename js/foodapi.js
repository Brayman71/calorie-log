/* Looking up branded foods online.
   Open Food Facts (free, open, worldwide) first; USDA FoodData Central (US government data) as the backup.
   Both allow requests straight from a web page, so no server is needed. */
window.CL = window.CL || {};
(function(){
const OFF="https://world.openfoodfacts.org";
const FDC="https://api.nal.usda.gov/fdc/v1";
const OFF_FIELDS="code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutrition_data_per,nutriments,image_front_small_url";
const UA={"X-User-Agent":"CalorieLog/1.0 (personal PWA)"};          // Open Food Facts asks apps to identify themselves

function fdcKey(){ try { return localStorage.getItem("calorie-log-fdc-key") || "DEMO_KEY"; } catch(e){ return "DEMO_KEY"; } }
function setFdcKey(k){ try { if (k) localStorage.setItem("calorie-log-fdc-key", k); else localStorage.removeItem("calorie-log-fdc-key"); } catch(e){} }

function digits(code){ return String(code||"").replace(/\D/g,""); }
function pad(code, n){ return code.length>=n? code : "0".repeat(n-code.length)+code; }
function r1(n){ return n==null || !Number.isFinite(n)? null : Math.round(n*10)/10; }
function first(...v){ for (const x of v){ const n=typeof x==="string"? parseFloat(x) : x; if (Number.isFinite(n)) return n; } return null; }

async function getJSON(url, opts, timeoutMs){
  const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(), timeoutMs||12000);
  try {
    const res=await fetch(url, Object.assign({signal:ctl.signal}, opts||{}));
    if (res.status===429) throw Object.assign(new Error("busy"), {code:"rate_limited"});
    if (!res.ok) throw Object.assign(new Error("HTTP "+res.status), {code:"http", status:res.status});
    return await res.json();
  } catch(e){
    if (e.name==="AbortError") throw Object.assign(new Error("timeout"), {code:"timeout"});
    if (!e.code) e.code = navigator.onLine===false? "offline" : "network";
    throw e;
  } finally { clearTimeout(t); }
}

/* ---------- Open Food Facts ---------- */
function fromOFF(p){
  if (!p) return null;
  const n=p.nutriments||{};
  const kcal100=first(n["energy-kcal_100g"], n["energy_100g"]!=null && n["energy-kcal_100g"]==null? n["energy_100g"]/4.184 : null, n["energy-kj_100g"]!=null? n["energy-kj_100g"]/4.184 : null);
  const per100 = kcal100==null? null : {kcal:kcal100, protein:first(n.proteins_100g), carbs:first(n.carbohydrates_100g), fat:first(n.fat_100g), fiber:first(n.fiber_100g)};
  const sq=first(p.serving_quantity);
  const liquid = p.nutrition_data_per==="100ml" || /ml\b|fl ?oz/i.test(p.serving_size||"");
  const base = liquid? "ml" : "g";
  const fromServ=k=>first(n[k+"_serving"]);
  const scale=(v)=> v==null || !sq? null : v*sq/100;
  let kcal=first(n["energy-kcal_serving"], n["energy-kj_serving"]!=null? n["energy-kj_serving"]/4.184 : null, per100 && scale(per100.kcal));
  let serving=p.serving_size || "", servingG=sq || null;
  if (kcal==null && per100){ kcal=per100.kcal; serving="100 "+base; servingG=100; }
  if (kcal==null) return {incomplete:true, name:p.product_name||p.product_name_en||"", brand:(p.brands||"").split(",")[0].trim(), barcode:p.code, src:"off"};
  const pick=(k, key)=> first(fromServ(k), per100 && (servingG===100 && serving==="100 "+base? per100[key] : scale(per100[key])));
  return {
    name:(p.product_name || p.product_name_en || p.generic_name || "Unnamed product").trim(),
    brand:(p.brands||"").split(",")[0].trim(),
    serving: serving || (servingG? servingG+" "+base : "1 serving"),
    servingG, base, barcode:p.code||null, src:"off",
    kcal:Math.round(kcal), protein:r1(pick("proteins","protein"))||0, carbs:r1(pick("carbohydrates","carbs"))||0, fat:r1(pick("fat","fat"))||0,
    fiber:r1(pick("fiber","fiber")), per100, image:p.image_front_small_url||null
  };
}
async function offBarcode(code){
  for (const c of [pad(code,13), code].filter((v,i,a)=>a.indexOf(v)===i)){
    const d=await getJSON(OFF+"/api/v2/product/"+c+"?fields="+OFF_FIELDS, {headers:UA});
    if (d && d.status===1 && d.product) return fromOFF(d.product);
  }
  return null;
}
async function offSearch(q){
  // Open Food Facts is mostly European, so US users get US-sold products first.
  const us=CL.store && CL.store.isUS();
  const url=OFF+"/cgi/search.pl?search_terms="+encodeURIComponent(q)+"&search_simple=1&json=1&page_size=20&fields="+OFF_FIELDS+
    (us? "&tagtype_0=countries&tag_contains_0=contains&tag_0=united-states" : "");
  let d;
  try { d=await getJSON(url, {headers:UA}, 15000); }
  catch(e){
    // The search server sometimes answers with a busy page (which the browser reports as a network/CORS error). One retry fixes most of these.
    if (e.code==="offline" || e.code==="rate_limited") throw e;
    await new Promise(r=>setTimeout(r,1500)); d=await getJSON(url, {headers:UA}, 15000);
  }
  return (d.products||[]).map(fromOFF).filter(f=>f && !f.incomplete);
}

/* ---------- USDA FoodData Central ---------- */
const NID={kcal:1008, protein:1003, carbs:1005, fat:1004, fiber:1079};
function fromFDC(f){
  const get=id=>{ const x=(f.foodNutrients||[]).find(n=>(n.nutrientId||(n.nutrient&&n.nutrient.id))===id); return x? first(x.value, x.amount) : null; };
  let kcal100=get(NID.kcal);
  if (kcal100==null){ const kj=(f.foodNutrients||[]).find(n=>n.nutrientId===1062); if (kj) kcal100=kj.value/4.184; }
  if (kcal100==null) return null;
  const per100={kcal:kcal100, protein:get(NID.protein), carbs:get(NID.carbs), fat:get(NID.fat), fiber:get(NID.fiber)};
  const unit=String(f.servingSizeUnit||"").toLowerCase();
  const base = /ml|mlt/.test(unit)? "ml" : "g";
  const branded=f.dataType==="Branded";
  let servingG = branded && /^(g|grm|ml|mlt)$/.test(unit)? first(f.servingSize) : null;
  let serving = servingG? ((f.householdServingFullText? f.householdServingFullText+" ("+Math.round(servingG)+" "+base+")" : Math.round(servingG)+" "+base)) : "100 "+base;
  if (!servingG) servingG=100;
  const k=servingG/100, s=v=>v==null? null : v*k;
  const title=s=>String(s||"").toLowerCase().replace(/(^|[\s,(])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  return {
    name: branded? title(f.description) : f.description,
    brand: branded? title(f.brandName||f.brandOwner||"") : "",
    serving, servingG, base, barcode:f.gtinUpc||null, src:"usda", fdcId:f.fdcId,
    kcal:Math.round(kcal100*k), protein:r1(s(per100.protein))||0, carbs:r1(s(per100.carbs))||0, fat:r1(s(per100.fat))||0, fiber:r1(s(per100.fiber)), per100
  };
}
async function fdcSearch(q, dataType, size){
  const url=FDC+"/foods/search?api_key="+encodeURIComponent(fdcKey())+"&pageSize="+(size||10)+"&query="+encodeURIComponent(q)+(dataType? "&dataType="+encodeURIComponent(dataType) : "");
  const d=await getJSON(url, null, 15000);
  return (d.foods||[]).map(fromFDC).filter(Boolean);
}
async function fdcBarcode(code){
  // USDA stores UPCs zero-padded to 14 digits, but older entries use 12 or 13.
  for (const c of [pad(code,14), pad(code,13), code].filter((v,i,a)=>a.indexOf(v)===i)){
    const list=await fdcSearch(c, "Branded", 3);
    const hit=list.find(f=>digits(f.barcode).replace(/^0+/,"")===code.replace(/^0+/,""));
    if (hit) return hit;
  }
  return null;
}

/* ---------- Public ---------- */
/* Returns {food} | {incomplete:{...partial}} | {notFound:true}. Throws {code} for network trouble. */
async function lookupBarcode(raw){
  const code=digits(raw);
  if (code.replace(/^0+/,"").length<6) return {notFound:true, code};
  let offErr=null, partial=null;
  try {
    const f=await offBarcode(code);
    if (f && !f.incomplete) return {food:f, code};
    if (f && f.incomplete) partial=f;
  } catch(e){ offErr=e; }
  try {
    const f=await fdcBarcode(code);
    if (f) return {food:f, code};
  } catch(e){ if (offErr) throw offErr; }
  if (offErr && offErr.code==="offline") throw offErr;
  return partial? {incomplete:partial, code} : {notFound:true, code};
}

/* Online search: everyday foods from USDA plus branded products from Open Food Facts. */
async function search(q){
  const ownKey=fdcKey()!=="DEMO_KEY";                      // the shared demo key allows only a few lookups an hour
  const tasks=[
    fdcSearch(q, "Foundation,SR Legacy", 8).catch(e=>({err:e})),
    offSearch(q).catch(e=>({err:e})),
    ownKey? fdcSearch(q, "Branded", 12).catch(e=>({err:e})) : Promise.resolve([])
  ];
  const [usda, off, branded]=await Promise.all(tasks);
  const out=[], seen=new Set(), errs=[];
  for (const list of [usda, branded, off]){
    if (list && list.err){ errs.push(list.err); continue; }
    for (const f of list){ const k=(f.name+"|"+f.brand).toLowerCase(); if (!seen.has(k)){ seen.add(k); out.push(f); } }
  }
  if (!out.length && errs.length) throw errs[errs.length-1];
  return out;
}

function errorText(e){
  const c=e && e.code;
  if (c==="offline") return "You're offline. Food lookups need internet, but you can still log foods you've used before or add one by hand.";
  if (c==="rate_limited") return "The food database is busy (too many lookups in a short time). Wait a minute and try again.";
  if (c==="timeout") return "The food database took too long to answer. Try again.";
  return "Couldn't reach the food database. Check your connection and try again.";
}

CL.foodapi = {lookupBarcode, search, errorText, digits, fdcKey, setFdcKey};
})();
