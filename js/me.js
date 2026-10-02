/* Me screen: the health questionnaire, your plan (with the math), and settings (API key, backup, install help). */
window.CL = window.CL || {};
(function(){
const U=CL.util, I=CL.ui, M=CL.math, St=CL.store, esc=U.esc, icon=I.icon, $=I.$;
let previewHealth=null, dirty=false;

const FORM=`
<form id="healthForm" class="card" novalidate>
  <div class="formsec">
    <h2>About you</h2>
    <p class="hint">Used to estimate how many calories you burn in a day.</p>
    <div class="fgrid">
      <fieldset class="full"><legend>Units</legend>
        <div class="seg"><label><input type="radio" name="units" value="us" checked>lb, ft</label><label><input type="radio" name="units" value="metric">kg, cm</label></div>
      </fieldset>
      <fieldset class="full"><legend>Sex for the calorie formula</legend>
        <div class="seg"><label><input type="radio" name="sex" value="female" id="sF">Female</label><label><input type="radio" name="sex" value="male">Male</label></div>
      </fieldset>
      <div class="field"><label for="hAge">Age</label><input id="hAge" type="number" inputmode="numeric" min="13" max="100" placeholder="30"></div>
      <div class="field" id="hgtUs"><span class="lbl">Height</span>
        <div class="hgt"><input id="hFt" type="number" inputmode="numeric" min="3" max="8" placeholder="ft" aria-label="Height, feet"><input id="hIn" type="number" inputmode="numeric" min="0" max="11" placeholder="in" aria-label="Height, inches"></div>
      </div>
      <div class="field" id="hgtMetric" hidden><label for="hCm">Height (cm)</label><input id="hCm" type="number" inputmode="numeric" min="120" max="230" placeholder="170"></div>
      <div class="field"><label for="hWeight" id="hWeightLabel">Weight (lb)</label><input id="hWeight" type="number" inputmode="decimal" step="0.1"></div>
      <div class="field"><label for="hGoal" id="hGoalLabel">Goal (lb)</label><input id="hGoal" type="number" inputmode="decimal" step="0.1"></div>
      <div class="field full"><label for="hBf">Body fat % (optional)</label><input id="hBf" type="number" inputmode="decimal" min="5" max="60" step="0.5" placeholder="Leave blank if you don't know"><span class="hint">Only if you've had it measured (DEXA scan, smart scale, or calipers).</span></div>
    </div>
  </div>
  <div class="formsec">
    <h2>How active are you?</h2>
    <p class="hint">Count a normal week, not your best one. When in doubt, pick the lower option.</p>
    <fieldset><legend>Day-to-day movement, outside of workouts</legend>
      <div class="opts">
        <label class="opt"><input type="radio" name="movement" value="sit"><div><b>Mostly sitting</b><span>Desk job, under 5,000 steps</span></div></label>
        <label class="opt"><input type="radio" name="movement" value="some" checked><div><b>Some walking</b><span>About 5,000–7,500 steps</span></div></label>
        <label class="opt"><input type="radio" name="movement" value="feet"><div><b>On my feet a lot</b><span>About 7,500–10,000 steps, or retail and teaching jobs</span></div></label>
        <label class="opt"><input type="radio" name="movement" value="active"><div><b>Physical job</b><span>Construction, warehouse, or 10,000+ steps</span></div></label>
      </div>
    </fieldset>
    <fieldset><legend>Workouts per week</legend>
      <div class="seg"><label><input type="radio" name="workouts" value="0" checked>None</label><label><input type="radio" name="workouts" value="1">1–2</label><label><input type="radio" name="workouts" value="3">3–4</label><label><input type="radio" name="workouts" value="5">5+</label></div>
    </fieldset>
    <fieldset id="wtypeBox"><legend>Kind of workouts</legend>
      <div class="seg"><label><input type="radio" name="workoutType" value="cardio" checked>Cardio</label><label><input type="radio" name="workoutType" value="mix">Mix</label><label><input type="radio" name="workoutType" value="strength">Weights</label></div>
    </fieldset>
  </div>
  <div class="formsec">
    <h2>How fast?</h2>
    <p class="hint">The cut is a share of what you burn, so it scales to your body. Slower means bigger portions and fewer cravings.</p>
    <div class="opts">
      <label class="opt"><input type="radio" name="pace" value="gentle"><div><b>Gentle · about 10% less than you burn</b><span>Barely feels like a diet</span><span class="dyn" id="paceDyn-gentle"></span></div></label>
      <label class="opt"><input type="radio" name="pace" value="steady" checked><div><b>Steady · about 20% less</b><span>Noticeable progress, still very livable</span><span class="dyn" id="paceDyn-steady"></span></div></label>
      <label class="opt"><input type="radio" name="pace" value="faster"><div><b>Faster · about 25% less</b><span>Works best with more to lose; you'll feel it more</span><span class="dyn" id="paceDyn-faster"></span></div></label>
    </div>
    <label class="check"><input type="checkbox" id="hCalib" checked><span>Fine-tune my targets using my food log and weigh-ins. After about 2 weeks, the app compares what you ate with how your weight changed and corrects its estimate of your daily burn.</span></label>
  </div>
  <div class="formsec">
    <h2>Health</h2>
    <p class="hint">Check any that apply. They change your targets and meals, and some mean you should talk to your doctor first.</p>
    <div class="opts">
      <label class="opt"><input type="checkbox" id="fPreg"><div><b>Pregnant or breastfeeding</b></div></label>
      <label class="opt"><input type="checkbox" id="fDiab"><div><b>Diabetes or prediabetes</b></div></label>
      <label class="opt"><input type="checkbox" id="fBp"><div><b>High blood pressure</b></div></label>
      <label class="opt"><input type="checkbox" id="fKid"><div><b>Kidney disease</b></div></label>
      <label class="opt"><input type="checkbox" id="fEd"><div><b>Past or current eating disorder</b></div></label>
    </div>
  </div>
  <div class="formsec">
    <h2>How you like to eat</h2>
    <p class="hint">This is what keeps the plan from feeling like a punishment.</p>
    <div class="fgrid">
      <div class="field"><label for="hDiet">Diet style</label><select id="hDiet"><option value="any">I eat everything</option><option value="vegetarian">Vegetarian</option><option value="pescatarian">Pescatarian</option><option value="vegan">Vegan</option></select></div>
      <div class="field"><label for="hHouse">Cooking for</label><select id="hHouse"><option value="1">Just me</option><option value="2">2 people</option><option value="3">3 people</option><option value="4">4 people</option><option value="5">5 or more</option></select></div>
      <div class="field full"><label for="hLoves">Foods you love</label><input id="hLoves" type="text" maxlength="200" placeholder="e.g. tacos, chicken, pasta, peanut butter"></div>
      <div class="field full"><label for="hAvoid">Allergies or foods you won't eat</label><input id="hAvoid" type="text" maxlength="200" placeholder="e.g. shellfish, mushrooms, dairy"></div>
      <div class="field"><label for="hTime">Time to cook dinner</label><select id="hTime"><option value="15">15 min, tops</option><option value="20">About 20 min</option><option value="30" selected>About 30 min</option><option value="45">45 min is fine</option></select></div>
      <div class="field"><label for="hBudget">Grocery budget</label><select id="hBudget"><option value="tight">Tight</option><option value="moderate" selected>Moderate</option><option value="flexible">Flexible</option></select></div>
      <fieldset class="full"><legend>Carbs or fats?</legend>
        <div class="seg"><label><input type="radio" name="carbStyle" value="balanced" checked>Balanced</label><label><input type="radio" name="carbStyle" value="lower">Fewer carbs</label><label><input type="radio" name="carbStyle" value="higher">More carbs</label></div>
        <span class="hint" style="display:block;margin-top:6px">Both work equally well when calories and protein match. Pick what keeps you full and happy.</span>
      </fieldset>
      <fieldset class="full"><legend>Cooking skill</legend>
        <div class="seg"><label><input type="radio" name="skill" value="beginner" checked>New to cooking</label><label><input type="radio" name="skill" value="comfortable">Comfortable</label></div>
      </fieldset>
    </div>
  </div>
  <button class="btn primary block" type="submit">Save my plan</button>
  <p class="err" id="healthErr" hidden style="margin-top:10px"></p>
</form>`;

function radio(name){ const el=document.querySelector('#healthForm input[name="'+name+'"]:checked'); return el? el.value : null; }
function setRadio(name, v){ const el=document.querySelector('#healthForm input[name="'+name+'"][value="'+v+'"]'); if (el) el.checked=true; }
function setUnitsUI(us){
  $("hgtUs").hidden=!us; $("hgtMetric").hidden=us;
  $("hWeightLabel").textContent="Weight ("+(us? "lb" : "kg")+")"; $("hGoalLabel").textContent="Goal ("+(us? "lb" : "kg")+")";
}
function syncFormUI(){ $("wtypeBox").hidden=(radio("workouts")||"0")==="0"; }

const LEGACY_ACT={sedentary:["sit","0"], light:["some","1"], moderate:["feet","3"], very:["active","5"]};
function fillForm(){
  const h=St.S.health; if (!h){ setUnitsUI(true); syncFormUI(); return; }
  const us=h.units!=="metric", K=U.KG_PER_LB;
  setRadio("units", us? "us" : "metric"); setUnitsUI(us);
  setRadio("sex", h.sex); $("hAge").value=h.age||"";
  if (h.heightCm){ const inches=h.heightCm/2.54; let ft=Math.floor(inches/12), inch=Math.round(inches%12); if (inch===12){ ft++; inch=0; } $("hFt").value=ft; $("hIn").value=inch; $("hCm").value=Math.round(h.heightCm); }
  const kg=St.latestKg(); if (kg) $("hWeight").value=U.g1(us? kg/K : kg);
  if (h.goalKg) $("hGoal").value=U.g1(us? h.goalKg/K : h.goalKg);
  $("hBf").value=M.hasBodyFat(h)? h.bodyFat : "";
  const legacy=LEGACY_ACT[h.activity]||LEGACY_ACT.light;
  setRadio("movement", h.movement||legacy[0]); setRadio("workouts", h.workouts||legacy[1]); setRadio("workoutType", h.workoutType||"cardio");
  setRadio("pace", M.PACE_PCT[h.pace]? h.pace : "steady"); setRadio("skill", h.skill||"beginner"); setRadio("carbStyle", h.carbStyle||"balanced");
  $("hCalib").checked=h.calibrate!==false;
  const f=h.flags||{}; $("fPreg").checked=!!f.pregnant; $("fDiab").checked=!!f.diabetes; $("fBp").checked=!!f.bp; $("fKid").checked=!!f.kidney; $("fEd").checked=!!f.ed;
  $("hDiet").value=h.diet||"any"; $("hHouse").value=String(Math.min(5,h.household||1)); $("hLoves").value=h.loves||""; $("hAvoid").value=h.avoid||"";
  $("hTime").value=String(h.cookTime||30); $("hBudget").value=h.budget||"moderate";
  syncFormUI();
}
function readForm(){
  const us=radio("units")!=="metric", K=U.KG_PER_LB, n=U.num;
  const sex=radio("sex"); if (!sex) return {err:"Choose the sex to use for the calorie formula.", focus:"sF"};
  const age=Math.round(n($("hAge").value)); if (!(age>=13 && age<=100)) return {err:"Enter an age between 13 and 100.", focus:"hAge"};
  const cm = us? (n($("hFt").value)*12+(n($("hIn").value)||0))*2.54 : n($("hCm").value);
  if (!(cm>=120 && cm<=230)) return {err:"Enter your height"+(us? " in feet and inches." : " in centimeters (120–230)."), focus:us? "hFt" : "hCm"};
  const wv=n($("hWeight").value), kg=us? wv*K : wv;
  if (!(kg>=35 && kg<=320)) return {err:"Enter your current weight.", focus:"hWeight"};
  const gv=n($("hGoal").value); const goalKg=Number.isFinite(gv)? (us? gv*K : gv) : null;
  if (goalKg!=null && !(goalKg>=30 && goalKg<=320)) return {err:"Enter a goal weight, or leave it blank.", focus:"hGoal"};
  const bfv=n($("hBf").value);
  if ($("hBf").value.trim() && !(bfv>=5 && bfv<=60)) return {err:"Body fat should be between 5% and 60%, or leave it blank.", focus:"hBf"};
  return {h:{
    units:us? "us" : "metric", sex, age, heightCm:Math.round(cm*10)/10, weightKg:Math.round(kg*100)/100, goalKg:goalKg==null? null : Math.round(goalKg*100)/100,
    bodyFat:Number.isFinite(bfv)? bfv : null,
    movement:radio("movement")||"some", workouts:radio("workouts")||"0", workoutType:radio("workoutType")||"cardio",
    pace:radio("pace")||"steady", skill:radio("skill")||"beginner", carbStyle:radio("carbStyle")||"balanced", calibrate:$("hCalib").checked,
    flags:{pregnant:$("fPreg").checked, diabetes:$("fDiab").checked, bp:$("fBp").checked, kidney:$("fKid").checked, ed:$("fEd").checked},
    diet:$("hDiet").value, household:parseInt($("hHouse").value,10)||1, loves:$("hLoves").value.trim().slice(0,200), avoid:$("hAvoid").value.trim().slice(0,200),
    cookTime:parseInt($("hTime").value,10)||30, budget:$("hBudget").value, updatedAt:Date.now()
  }};
}

/* ---------- The plan result ---------- */
const pct=x=>Math.round(x*100)+"%";
function perKgText(gpk){ return U.g1(gpk)+" g per kg"+(St.isUS()? " ("+U.g1(gpk*U.KG_PER_LB)+" g per lb)" : ""); }
function strengthLevel(h){ if (!h.workouts || h.workouts==="0") return 0; return h.workoutType==="strength"? 2 : h.workoutType==="mix"? 1 : 0; }

function resultHTML(){
  const preview=dirty && previewHealth, h=preview? previewHealth : St.S.health;
  const p=h? M.computePlan(h, preview? previewHealth.weightKg : St.latestKg()) : null;
  updatePaceHints(h, preview? previewHealth.weightKg : St.latestKg());
  if (!p) return '<p class="hint">Answer the questions to see your daily targets. They update as you type.</p>';
  const unit=St.wUnit(), c=p.calib, us=St.isUS();
  let x=preview? '<p class="preview">Preview. Tap Save to use these targets.</p>' : "";
  x+='<div class="target"><b class="num">'+U.fmt(p.target)+'</b><span>kcal a day</span></div>'+
    '<p class="hint">'+(p.lose? "About "+U.g1(us? p.lbPerWeek : p.kgPerWeek)+" "+unit+" a week, from a "+pct(p.pct)+" cut" : "Maintenance, no cut")+' · includes a '+U.fmt(p.flex)+' kcal treat allowance for anything you like.</p>'+
    '<dl class="kv">'+
    '<dt>Calories you burn a day'+(c && c.ready? " (tuned to your log)" : " (estimate)")+'</dt><dd>'+U.fmt(p.tdee)+'</dd>'+
    '<dt><span style="color:var(--protein)">●</span> Protein<span class="range">'+(p.pMin<p.pMax? "Anywhere from "+p.pMin+"–"+p.pMax+" g works. Get at least "+p.pMin+" g." : "Keep close to this number.")+'</span></dt><dd>'+p.protein+' g</dd>'+
    '<dt><span style="color:var(--carbs)">●</span> Carbs<span class="range">'+pct(p.carbPct)+' of calories. Flexible.</span></dt><dd>'+p.carbs+' g</dd>'+
    '<dt><span style="color:var(--fat)">●</span> Fat<span class="range">'+pct(p.fatPct)+' of calories. Flexible.</span></dt><dd>'+p.fat+' g</dd>'+
    '<dt><span style="color:var(--fiber)">●</span> Fiber<span class="range">Keeps you full. 14 g per 1,000 kcal.</span></dt><dd>'+p.fiber+' g+</dd>'+
    '<dt>BMI now'+(p.goalBmi? " → at goal" : "")+'</dt><dd>'+U.g1(p.bmi)+(p.goalBmi? " → "+U.g1(p.goalBmi) : "")+'</dd>';
  if (p.weeks){ const d=new Date(); d.setDate(d.getDate()+Math.round(p.weeks*7)); x+='<dt>Reach '+St.wFmt(p.goalKg)+' '+unit+' around<span class="range">Loss slows a little as you get lighter. This accounts for it.</span></dt><dd>'+esc(d.toLocaleDateString(undefined,{month:"short", year:"numeric"}))+'</dd>'; }
  x+='</dl>';
  if (h.calibrate!==false && c){
    if (c.ready){
      const trend=us? c.slopeWk/U.KG_PER_LB : c.slopeWk;
      x+='<div class="calib"><b>Tuned to your log</b>Over the last 4 weeks you averaged '+U.fmt(c.avgIntake)+' kcal on '+c.days+' fully logged days, and your weight trended '+(trend<=0? "down " : "up ")+U.g1(Math.abs(trend))+' '+unit+' a week. That puts your real burn near '+U.fmt(c.observed)+' kcal; the formula guessed '+U.fmt(p.formulaTdee)+'.'+
        (c.clamped? " The adjustment is limited to 25% for now. Make sure you're logging drinks and cooking oil too." : "")+'</div>';
    } else {
      const prog=(Math.min(1,c.days/c.needDays)+Math.min(1,c.weighIns/c.needWeighIns)+Math.min(1,c.span/14))/3;
      x+='<div class="calib"><b>Learning your real burn</b>Formulas can be off by 10% or more for any one person. After '+c.needDays+' fully logged days and '+c.needWeighIns+' weigh-ins over 2 weeks, the app checks the math against what actually happened. So far: '+
        Math.min(c.days,c.needDays)+' of '+c.needDays+' days, '+Math.min(c.weighIns,c.needWeighIns)+' of '+c.needWeighIns+' weigh-ins.<div class="bar2"><i style="width:'+Math.round(prog*100)+'%"></i></div></div>';
    }
  }
  if (p.notes.length) x+='<ul class="notes">'+p.notes.map(([lvl,t])=>'<li><span class="pill '+(lvl==="info"? "" : lvl)+'">'+(lvl==="stop"? "Important" : lvl==="warn"? "Check first" : "Note")+'</span>'+esc(t)+'</li>').join("")+'</ul>';
  const refWhy = p.refLabel==="lean mass"? "Your weight minus your body fat. Muscle is what protein protects."
    : p.refLabel==="adjusted weight"? "A healthy weight for your height (BMI 22) plus 40% of the rest. Body fat doesn't need protein, so your full weight would overshoot." : "Your current weight.";
  const str=strengthLevel(h), why=[];
  if (p.lose) why.push("set higher during a cut to protect muscle");
  if (str===2) why.push("plus extra because you lift weights"); else if (str===1) why.push("plus a little for your strength work");
  if ((h.flags||{}).kidney){ why.length=0; why.push("kept low for kidney health"); }
  x+='<details class="math"><summary>Show the math</summary><ol>'+
    '<li>Resting burn: <b>'+U.fmt(p.bmr)+' kcal</b><span>'+(p.method==="Katch–McArdle"? "Katch–McArdle formula, from your lean mass." : "Mifflin–St Jeor formula, from your weight, height, age and sex. The most accurate standard formula for most adults.")+'</span></li>'+
    '<li>× '+U.g1(p.mult)+' for your activity = <b>'+U.fmt(p.formulaTdee)+' kcal</b> a day<span>Your daily movement plus your workouts.</span></li>'+
    (c && c.ready? '<li>Adjusted with your log to <b>'+U.fmt(p.tdee)+' kcal</b><span>A blend of the formula and what your food log and weigh-ins show.</span></li>' : "")+
    (p.lose? '<li>Minus '+pct(p.pct)+' = <b>'+U.fmt(p.target)+' kcal</b> a day<span>The cut is a share of your burn, so it fits your size. It never goes past '+(p.bmi<25? "0.5" : p.bmi<30? "0.75" : "1")+'% of your body weight a week, or below '+(h.sex==="male"? "1,500" : "1,200")+' kcal.</span></li>' : '<li>No cut, so your target is <b>'+U.fmt(p.target)+' kcal</b></li>')+
    '<li>Protein: '+perKgText(p.gpk)+' × '+St.wFmt(p.ref)+' '+unit+' '+esc(p.refLabel)+' = <b>'+p.protein+' g</b><span>'+refWhy+(why.length? " The amount per kg is "+why.join(", ")+"." : "")+' Capped at 35% of calories.</span></li>'+
    '<li>Fat: '+pct(p.fatPct)+' of calories = <b>'+p.fat+' g</b><span>Never below 20% of calories, which your hormones need.</span></li>'+
    '<li>Carbs: what\'s left = <b>'+p.carbs+' g</b><span>Kept at '+(p.style==="lower"? "50" : "100")+' g or more to fuel your brain and workouts.</span></li>'+
    '<li>Fiber: 14 g per 1,000 kcal = <b>'+p.fiber+' g</b> or more<span>From the US Dietary Guidelines.</span></li></ol></details>';
  x+='<h3 style="margin-top:16px">How to keep this livable</h3><ul class="livable">'+
    '<li>Hit calories and protein. Carbs and fat can trade places day to day.</li>'+
    '<li>No food is off-limits. Use your treat allowance every day if you want.</li>'+
    '<li>Get protein and vegetables at each meal. They keep you full on fewer calories.</li>'+
    '<li>Aim for your target 5 days out of 7. The weekly budget on Today lets big days balance out.</li></ul>'+
    '<p class="fine">These are estimates, and every formula can be off for a given person. That\'s why the app learns from your log. This is general guidance, not medical advice.</p>';
  return x;
}
function updatePaceHints(h, kg){
  for (const k of Object.keys(M.PACE_PCT)){
    const el=$("paceDyn-"+k); if (!el) continue;
    const p = h && kg? M.computePlan(Object.assign({}, h, {pace:k}), kg) : null;
    el.textContent = p && p.lose? "For you: "+U.fmt(p.target)+" kcal a day, about "+U.g1(St.isUS()? p.lbPerWeek : p.kgPerWeek)+" "+St.wUnit()+" a week"+(p.pace!==k? " (gentle pace is used for you)" : "") : "";
  }
}

/* ---------- Settings ---------- */
function isStandalone(){ return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone===true; }
function settingsHTML(){
  const S=St.S, pr=S.profile, key=St.getApiKey(), custom=pr.goalsMode==="custom";
  let theme="system"; try { theme=localStorage.getItem("calorie-log-theme")||"system"; } catch(e){}
  const fdc=CL.foodapi.fdcKey();
  return '<section class="card setlist" id="settings"><h2>Settings</h2>'+
  (isStandalone()? "" : '<section class="install"><h3>Put it on your home screen</h3><ol><li>Open this page in <b>Safari</b> on your iPhone.</li><li>Tap the <b>Share</b> button '+icon("share")+'.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol><p class="hint">It then opens full-screen like an app, works offline, and can use the camera to scan barcodes. Data you log in Safari doesn\'t move to the home-screen app on its own, so install it first or use Backup below.</p></section>')+
  '<section><h3>Daily targets</h3><div class="seg" role="radiogroup"><label><input type="radio" name="gmode" value="plan"'+(custom? "" : " checked")+'>From my plan</label><label><input type="radio" name="gmode" value="custom"'+(custom? " checked" : "")+'>My own numbers</label></div>'+
    '<div class="fgrid" id="customGoals"'+(custom? "" : " hidden")+'><div class="field"><label for="gK">Calories</label><input id="gK" type="number" inputmode="numeric" value="'+(pr.goal||2000)+'"></div><div class="field"><label for="gP">Protein g</label><input id="gP" type="number" inputmode="numeric" value="'+(pr.protein||0)+'"></div><div class="field"><label for="gC">Carbs g</label><input id="gC" type="number" inputmode="numeric" value="'+(pr.carbs||0)+'"></div><div class="field"><label for="gF">Fat g</label><input id="gF" type="number" inputmode="numeric" value="'+(pr.fat||0)+'"></div></div></section>'+
  '<section><h3>Water goal</h3><div class="row"><input id="waterGoal" type="number" inputmode="numeric" min="1" max="20" value="'+(pr.waterGoal||8)+'" style="max-width:90px"><span class="hint">glasses a day ('+(St.isUS()? "8 oz" : "250 ml")+' each)</span></div></section>'+
  '<section><h3>'+icon("sparkle")+' Claude (optional)</h3>'+
    '<p class="hint">Turns on custom-written meal plans, recipe swaps, nutrition-label photos and meal-photo estimates. Without it, everything else still works, including the recipe book and barcode scanner.</p>'+
    '<div class="keyrow"><input type="password" id="apiKey" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="'+(key? "••••••••••••" : "")+'" aria-label="Anthropic API key"><button type="button" class="btn small" data-set="savekey">'+(key? "Replace" : "Save")+'</button></div>'+
    '<p id="keyStatus" class="'+(key? "ok" : "hint")+'">'+(key? "Key saved on this phone." : "")+'</p>'+
    (key? '<div class="row"><button type="button" class="btn small" data-set="testkey">Test key</button><button type="button" class="btn small danger" data-set="delkey">Remove key</button></div>' : "")+
    '<p class="fine">Get a key at console.anthropic.com → API Keys, and set a monthly spend limit there. Typical cost: 1–3¢ per photo, 10–25¢ per custom week (model: '+CL.claude.MODEL+'). The key is stored only on this phone and sent only to Anthropic. Anyone who can unlock your phone and open this app could use it.</p></section>'+
  '<section><h3>Food database key (optional)</h3><p class="hint">Barcode scans use Open Food Facts first. USDA FoodData Central is the backup and also adds US branded foods to search; its shared demo key only allows a few lookups an hour. A free personal key from api.data.gov/signup allows 1,000 an hour.</p>'+
    '<div class="keyrow"><input type="text" id="fdcKey" autocomplete="off" spellcheck="false" placeholder="USDA key" value="'+(fdc==="DEMO_KEY"? "" : esc(fdc))+'" aria-label="USDA API key"><button type="button" class="btn small" data-set="fdc">Save</button></div></section>'+
  '<section><h3>Backup</h3><p class="hint">Everything is stored on this phone only. Save a backup now and then, and use it to move to a new phone or bring over data from the Claude version of the app.</p>'+
    '<div class="row"><button type="button" class="btn small" data-set="export">'+icon("share")+'Save backup</button><button type="button" class="btn small" data-set="import">Restore from file</button><button type="button" class="btn small" data-set="paste">Paste backup</button></div></section>'+
  '<section><h3>Appearance</h3><div class="seg"><label><input type="radio" name="theme" value="system"'+(theme==="system"? " checked" : "")+'>Auto</label><label><input type="radio" name="theme" value="light"'+(theme==="light"? " checked" : "")+'>Light</label><label><input type="radio" name="theme" value="dark"'+(theme==="dark"? " checked" : "")+'>Dark</label></div></section>'+
  '<section><h3>Start over</h3><button type="button" class="btn small danger" data-set="reset" style="justify-self:start">Delete all my data</button></section>'+
  '<p class="fine">Food data from Open Food Facts (openfoodfacts.org, ODbL) and USDA FoodData Central. Barcode reading by ZXing.</p></section>';
}

/* ---------- Render + events ---------- */
function render(){
  const el=$("screen-me");
  if (!$("healthForm")){
    el.innerHTML='<header class="screenhead"><h1>Me</h1><span class="hint">Private to this phone</span></header>'+
      '<section class="card" id="planResult"><h2 style="margin-bottom:8px">Your plan</h2><div id="prBody"></div></section>'+FORM+'<div id="settingsBox"></div>';
    fillForm();
  } else if (!dirty && !$("healthForm").contains(document.activeElement)) fillForm();   // e.g. a new weigh-in from Progress
  $("prBody").innerHTML=resultHTML();
  if (!$("settingsBox").contains(document.activeElement)) $("settingsBox").innerHTML=settingsHTML();
}

function onInput(e){
  if (!e.target.closest("#healthForm")) return;
  if (e.target.name==="units"){ setUnitsUI(e.target.value==="us"); convertUnits(e.target.value==="us"); }
  syncFormUI();
  const r=readForm(); dirty=true; previewHealth=r.h||null;
  $("prBody").innerHTML=resultHTML();
}
/* Switching units converts what's already typed. */
function convertUnits(us){
  const K=U.KG_PER_LB, n=U.num;
  for (const id of ["hWeight","hGoal"]){ const v=n($(id).value); if (Number.isFinite(v)) $(id).value=U.g1(us? v/K : v*K); }
  if (us){ const cm=n($("hCm").value); if (Number.isFinite(cm)){ const inches=cm/2.54; $("hFt").value=Math.floor(inches/12); $("hIn").value=Math.round(inches%12); } }
  else { const ft=n($("hFt").value), inch=n($("hIn").value)||0; if (Number.isFinite(ft)) $("hCm").value=Math.round((ft*12+inch)*2.54); }
}
function onSubmit(e){
  if (e.target.id!=="healthForm") return;
  e.preventDefault();
  const r=readForm();
  if (r.err){ $("healthErr").textContent=r.err; $("healthErr").hidden=false; const f=$(r.focus); if (f){ f.focus(); f.scrollIntoView({block:"center"}); } return; }
  $("healthErr").hidden=true;
  const S=St.S, h=r.h, prevKg=St.latestKg();
  S.health=h;
  if (!prevKg || Math.abs(prevKg-h.weightKg)>0.05) St.logWeight(U.today(), h.weightKg);
  dirty=false; previewHealth=null;
  St.changed();
  $("planResult").scrollIntoView({behavior:"smooth", block:"start"});
  I.toast("Plan saved: "+U.fmt(M.goals().goal)+" kcal a day");
}

function download(name, text){
  const blob=new Blob([text], {type:"application/json"});
  const file=new File([blob], name, {type:"application/json"});
  if (navigator.canShare && navigator.canShare({files:[file]})){ navigator.share({files:[file], title:"Calorie Log backup"}).catch(()=>{}); return; }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function doImport(text){
  try {
    const d=JSON.parse(text);
    const n=d && d.days? Object.keys(d.days).length : 0;
    if (!confirm("Replace everything on this phone with this backup"+(n? " ("+n+" days of food logs)" : "")+"?")) return;
    St.importJSON(text);
    $("screen-me").innerHTML="";       // rebuild the form with the restored answers
    I.closeSheet(); I.toast("Backup restored");
  } catch(e){ alert(e.message && !/JSON/.test(e.message)? e.message : "That isn't a Calorie Log backup file."); }
}

async function onClick(e){
  const b=e.target.closest("[data-set]"); if (!b) return;
  const a=b.dataset.set, S=St.S;
  if (a==="savekey"){
    const v=$("apiKey").value.trim();
    if (!v || /^•+$/.test(v)){ $("apiKey").value=""; $("apiKey").focus(); return; }
    if (!/^sk-ant-/.test(v)){ $("keyStatus").className="err"; $("keyStatus").textContent="That doesn't look like an Anthropic key. It starts with sk-ant-."; return; }
    St.setApiKey(v); $("keyStatus").className="hint"; $("keyStatus").textContent="Checking the key…";
    try { await CL.claude.testKey(); $("settingsBox").innerHTML=settingsHTML(); $("keyStatus").className="ok"; $("keyStatus").textContent="Key works. Claude features are on."; }
    catch(err){ $("settingsBox").innerHTML=settingsHTML(); $("keyStatus").className="err"; $("keyStatus").textContent="Saved, but the test failed: "+CL.claude.errorText(err); }
    CL.app.renderAll(); return;
  }
  if (a==="testkey"){
    $("keyStatus").className="hint"; $("keyStatus").textContent="Checking…";
    try { await CL.claude.testKey(); $("keyStatus").className="ok"; $("keyStatus").textContent="Key works."; }
    catch(err){ $("keyStatus").className="err"; $("keyStatus").textContent=CL.claude.errorText(err); }
    return;
  }
  if (a==="delkey"){ if (confirm("Remove the API key from this phone?")){ St.setApiKey(""); $("settingsBox").innerHTML=settingsHTML(); CL.app.renderAll(); } return; }
  if (a==="fdc"){ CL.foodapi.setFdcKey($("fdcKey").value.trim()); I.toast("Saved"); return; }
  if (a==="export"){ St.saveNow(); download("calorie-log-backup-"+U.today()+".json", St.exportJSON()); return; }
  if (a==="import"){ $("importInput").value=""; $("importInput").click(); return; }
  if (a==="paste"){
    const el=I.openSheet({title:"Paste backup", body:'<p class="hint">Paste the text of a backup file, including from the Claude version of the app.</p><textarea id="pasteBox" rows="10" placeholder="{ … }"></textarea>', foot:'<button type="button" class="btn primary" id="pasteGo">Restore</button>'});
    $("pasteGo").onclick=()=>{ const t=$("pasteBox").value.trim(); if (t) doImport(t); };
    return;
  }
  if (a==="reset"){
    if (confirm("Delete all food logs, weigh-ins, plans and settings on this phone? Save a backup first if you might want them.") && confirm("Really delete everything? This can't be undone.")){
      St.reset(); $("screen-me").innerHTML=""; CL.app.renderAll(); I.toast("Everything was deleted");
    }
  }
}
function onChange(e){
  const t=e.target, S=St.S, pr=S.profile;
  if (t.name==="gmode"){ pr.goalsMode=t.value; $("customGoals").hidden=t.value!=="custom"; St.changed(); return; }
  if (["gK","gP","gC","gF"].includes(t.id)){
    const v=Math.round(U.num(t.value)); if (!(v>=0)) return;
    const k={gK:"goal", gP:"protein", gC:"carbs", gF:"fat"}[t.id];
    if (k==="goal" && v<800) return;
    pr[k]=v; St.changed(); return;
  }
  if (t.id==="waterGoal"){ const v=Math.round(U.num(t.value)); if (v>=1 && v<=20){ pr.waterGoal=v; St.changed(); } return; }
  if (t.name==="theme"){ CL.app.setTheme(t.value); return; }
  if (t.id==="importInput"){ const f=t.files && t.files[0]; if (f) f.text().then(doImport); }
}

CL.me={render, onInput, onSubmit, onClick, onChange, get dirty(){ return dirty; }};
})();
