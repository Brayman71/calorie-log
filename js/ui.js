/* Shared screen helpers: icons, toast, bottom sheet, and the food-log actions every screen uses. */
window.CL = window.CL || {};
(function(){
const U=CL.util;
const $=id=>document.getElementById(id);
const icon=(name, cls)=>'<svg class="i'+(cls? " "+cls : "")+'" aria-hidden="true"><use href="#i-'+name+'"/></svg>';

const MEALS=["Breakfast","Lunch","Dinner","Snacks"];
const SLOT_MEAL={breakfast:"Breakfast", lunch:"Lunch", dinner:"Dinner", snack:"Snacks"};
function guessMeal(){
  const d=new Date(), m=d.getHours()*60+d.getMinutes();
  if (m<630) return "Breakfast"; if (m<870) return "Lunch"; if (m<1020) return "Snacks"; if (m<1260) return "Dinner"; return "Snacks";
}

/* ---------- Toast with optional undo ---------- */
let toastTimer=null, undoFn=null;
function toast(msg, undo){
  $("toastMsg").textContent=msg; undoFn=undo||null;
  $("toastUndo").hidden=!undo; $("toast").hidden=false;
  clearTimeout(toastTimer); toastTimer=setTimeout(hideToast, undo? 6000 : 3200);
}
function hideToast(){ $("toast").hidden=true; undoFn=null; }

/* ---------- Bottom sheet ---------- */
let sheetOnClose=null, lastFocus=null;
function openSheet({title, body, foot, onClose}){
  const sh=$("sheet"), scrim=$("scrim");
  if (sh.hidden) lastFocus=document.activeElement;
  $("sheetTitle").textContent=title||"";
  $("sheetBody").innerHTML=body||"";
  $("sheetFoot").innerHTML=foot||""; $("sheetFoot").hidden=!foot;
  sheetOnClose=onClose||null;
  sh.hidden=false; scrim.hidden=false;
  requestAnimationFrame(()=>{ sh.classList.add("on"); scrim.classList.add("on"); });
  document.body.style.overflow="hidden";
  $("sheetBody").scrollTop=0;
  return $("sheetBody");
}
function setSheet({title, body, foot}){
  if (title!=null) $("sheetTitle").textContent=title;
  if (body!=null){ $("sheetBody").innerHTML=body; $("sheetBody").scrollTop=0; }
  if (foot!==undefined){ $("sheetFoot").innerHTML=foot||""; $("sheetFoot").hidden=!foot; }
}
function closeSheet(){
  const sh=$("sheet"), scrim=$("scrim");
  if (sh.hidden) return;
  sh.classList.remove("on"); scrim.classList.remove("on");
  document.body.style.overflow="";
  const fn=sheetOnClose; sheetOnClose=null;
  setTimeout(()=>{ sh.hidden=true; scrim.hidden=true; $("sheetBody").innerHTML=""; }, 220);
  if (fn) fn();
  if (lastFocus && lastFocus.focus) try { lastFocus.focus({preventScroll:true}); } catch(e){}
}
function sheetOpen(){ return !$("sheet").hidden; }

/* ---------- Food log actions ---------- */
function scaleFood(food, servings){
  const s=servings>0? servings : 1;
  const r=v=>Math.round((v||0)*s*10)/10;
  return {kcal:Math.round((food.kcal||0)*s), protein:r(food.protein), carbs:r(food.carbs), fat:r(food.fat), fiber:food.fiber==null? null : r(food.fiber)};
}
/* A copy of what one serving of the food was, so an entry can be edited later. */
function foodSnapshot(food){
  const f={name:food.name, brand:food.brand||"", serving:food.serving||"", kcal:+food.kcal||0, protein:+food.protein||0, carbs:+food.carbs||0, fat:+food.fat||0, fiber:food.fiber==null? null : +food.fiber};
  if (food.per100){ f.per100=food.per100; f.servingG=food.servingG||null; f.base=food.base||"g"; }
  if (food.barcode) f.barcode=food.barcode;
  if (food.src) f.src=food.src;
  return f;
}
function addEntry(date, food, servings, meal, extra){
  const s=servings>0? servings : 1, d=CL.store.day(date);
  const e=Object.assign({id:U.uid(), name:String(food.name||"Food").trim().slice(0,90), brand:food.brand||"", serving:food.serving||"", servings:s, meal,
    food:foodSnapshot(food), at:Date.now()}, scaleFood(food, s), extra||{});
  d.entries.push(e);
  rememberFood(food);
  CL.store.changed();
  return e;
}
function updateEntry(date, id, servings, meal){
  const d=CL.store.day(date), e=d.entries.find(x=>x.id===id); if (!e) return;
  const base=e.food || {kcal:e.kcal/(e.servings||1), protein:e.protein/(e.servings||1), carbs:e.carbs/(e.servings||1), fat:e.fat/(e.servings||1), fiber:e.fiber==null? null : e.fiber/(e.servings||1)};
  Object.assign(e, scaleFood(base, servings), {servings, meal});
  CL.store.changed();
}
function removeEntry(date, id){
  const d=CL.store.day(date), idx=d.entries.findIndex(e=>e.id===id); if (idx<0) return;
  const [gone]=d.entries.splice(idx,1);
  CL.store.pruneEmptyDay(date); CL.store.changed();
  toast("Removed "+gone.name, ()=>{ const dd=CL.store.day(date); dd.entries.splice(Math.min(idx, dd.entries.length),0,gone); CL.store.changed(); });
}
function copyEntries(fromDate, toDate, meal){
  const src=CL.store.peekDay(fromDate).entries.filter(e=>!meal || e.meal===meal);
  if (!src.length) return 0;
  const d=CL.store.day(toDate), ids=[];
  for (const e of src){ const c=Object.assign(U.clone(e), {id:U.uid(), at:Date.now()}); d.entries.push(c); ids.push(c.id); }
  CL.store.changed();
  toast("Copied "+src.length+(src.length===1? " item" : " items"), ()=>{ const dd=CL.store.day(toDate); dd.entries=dd.entries.filter(e=>!ids.includes(e.id)); CL.store.pruneEmptyDay(toDate); CL.store.changed(); });
  return src.length;
}

/* Recently logged foods, newest first (max 40). */
function foodKey(f){ return (f.barcode? "#"+f.barcode : (f.name+"|"+(f.brand||"")+"|"+(f.serving||"")).toLowerCase()); }
function rememberFood(food){
  const pr=CL.store.S.profile, item=foodSnapshot(food), k=foodKey(item);
  pr.recents=[item, ...(pr.recents||[]).filter(r=>foodKey(r)!==k)].slice(0,40);
}
function isFavorite(food){ const k=foodKey(food); return (CL.store.S.profile.favorites||[]).some(f=>foodKey(f)===k); }
function toggleFavorite(food){
  const pr=CL.store.S.profile, k=foodKey(food);
  if (isFavorite(food)) pr.favorites=pr.favorites.filter(f=>foodKey(f)!==k);
  else pr.favorites=[foodSnapshot(food), ...(pr.favorites||[])].slice(0,100);
  CL.store.changed();
  return isFavorite(food);
}
/* Scanned, searched and hand-made foods are kept so they work offline next time. */
function saveMyFood(food){
  const S=CL.store.S, k=foodKey(food);
  S.myFoods=[foodSnapshot(food), ...S.myFoods.filter(f=>foodKey(f)!==k)].slice(0,300);
  CL.store.changed();
}
function myFoodByBarcode(code){
  const c=CL.foodapi.digits(code).replace(/^0+/,"");
  return CL.store.S.myFoods.find(f=>f.barcode && CL.foodapi.digits(f.barcode).replace(/^0+/,"")===c) || null;
}

/* ---------- Gentle streak: days logged in a row, forgiving one missed day each week ---------- */
function streak(){
  const has=d=>CL.store.peekDay(d).entries.length>0;
  let d=U.today(); if (!has(d)) d=U.addDays(d,-1);
  let n=0, lastSkip=null;
  for (let i=0;i<730;i++){
    if (has(d)){ n++; }
    else {
      const prev=U.addDays(d,-1);
      const canSkip=n>0 && has(prev) && (lastSkip==null || (U.parseDay(lastSkip)-U.parseDay(d))/864e5>=7);
      if (!canSkip) break;
      lastSkip=d;
    }
    d=U.addDays(d,-1);
  }
  return n;
}
function loggedDaysIn(lastN){
  let n=0; for (let i=0;i<lastN;i++){ if (CL.store.peekDay(U.addDays(U.today(),-i)).entries.length) n++; } return n;
}

function macroText(o){ return Math.round(o.protein||0)+"P · "+Math.round(o.carbs||0)+"C · "+Math.round(o.fat||0)+"F"; }

CL.ui = {$, icon, MEALS, SLOT_MEAL, guessMeal, toast, hideToast, openSheet, setSheet, closeSheet, sheetOpen,
  scaleFood, foodSnapshot, addEntry, updateEntry, removeEntry, copyEntries, rememberFood, isFavorite, toggleFavorite, saveMyFood, myFoodByBarcode, foodKey,
  streak, loggedDaysIn, macroText, get undo(){ return undoFn; }};
})();
