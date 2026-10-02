/* The plan math: daily burn, a calm calorie target, and protein / fat / carbs / fiber.
   Same formulas as the Claude version of the app, so both give the same numbers. */
window.CL = window.CL || {};
(function(){
const U=CL.util, St=()=>CL.store;
const {round5, round10, g1, fmt, addDays, today, parseDay, KG_PER_LB}=U;

const ACT = {sedentary:1.2, light:1.375, moderate:1.55, very:1.725};   // answers saved before movement/workouts existed
const MOVE = {sit:1.2, some:1.3, feet:1.4, active:1.5};
const WORK = {"0":0, "1":0.075, "3":0.15, "5":0.225};
const PACE_PCT = {gentle:0.10, steady:0.20, faster:0.25};               // share of daily burn
const KCAL_PER_KG = 7700;

function hasBodyFat(h){ return h.bodyFat>=5 && h.bodyFat<=60; }
function activityMult(h){
  if (h.movement) return (MOVE[h.movement]||MOVE.some) + (WORK[h.workouts]||0);
  return ACT[h.activity]||ACT.light;
}
function strengthLevel(h){
  if (!h.workouts || h.workouts==="0") return 0;
  return h.workoutType==="strength"? 2 : h.workoutType==="mix"? 1 : 0;
}

/* Resting burn × activity. Katch–McArdle when body fat is known (it uses lean mass), otherwise Mifflin–St Jeor. */
function energy(h, kg){
  let bmr, method;
  if (hasBodyFat(h)){ bmr=370+21.6*kg*(1-h.bodyFat/100); method="Katch–McArdle"; }
  else { bmr=10*kg + 6.25*h.heightCm - 5*h.age + (h.sex==="male"? 5 : -161); method="Mifflin–St Jeor"; }
  const mult=activityMult(h);
  return {bmr, mult, tdee:bmr*mult, method};
}

/* Calories for one body weight. ratio = how far the log says the formula is off (1 = trust the formula). */
function energyTarget(h, kg, ratio, lose, pace){
  const e=energy(h, kg), m2=(h.heightCm/100)**2, bmi=kg/m2, lb=kg/KG_PER_LB;
  const tdee=e.tdee*(ratio||1), floor=h.sex==="male"? 1500 : 1200;
  let deficit=0, capPct=0;
  if (lose){
    deficit=tdee*PACE_PCT[pace];
    // Leaner bodies lose more muscle when cutting hard, so the weekly cap tightens as BMI drops.
    const maxPct = bmi<25? 0.005 : bmi<30? 0.0075 : 0.01;
    const cap=maxPct*lb*500;
    if (deficit>cap){ deficit=cap; capPct=maxPct; }
  }
  let target=round10(tdee-deficit), floorHit=false, nearFloor=false;
  if (lose && tdee<=floor+50){ target=round10(tdee); nearFloor=true; }
  else if (lose && target<floor){ target=floor; floorHit=true; }
  const realDeficit=Math.max(0, tdee-target);
  return {e, tdee, target, deficit:realDeficit, pct:realDeficit/tdee, lbPerWeek:realDeficit*7/3500, kgPerWeek:realDeficit*7/KCAL_PER_KG, bmi, floor, floorHit, nearFloor, capPct};
}

/* Protein first, then a fat floor, then carbs fill the rest. */
function macroSplit(h, kg, target, lose){
  const m2=(h.heightCm/100)**2, bmi=kg/m2, f=h.flags||{}, str=strengthLevel(h), style=h.carbStyle||"balanced";
  let ref, refLabel, gpk, pMinPk, pMaxPk;
  if (hasBodyFat(h)){
    ref=kg*(1-h.bodyFat/100); refLabel="lean mass";
    gpk = lose? 2.0 : 1.7; pMinPk=1.6; pMaxPk=2.6;
  } else if (bmi>25){
    // Body fat doesn't need protein, so heavier bodies use an adjusted weight: healthy weight (BMI 22) plus 40% of the extra.
    const ibw=22*m2; ref=ibw+0.4*(kg-ibw); refLabel="adjusted weight";
    gpk = lose? 1.6 : 1.3; pMinPk=1.2; pMaxPk=2.2;
  } else {
    ref=kg; refLabel="body weight";
    gpk = lose? 1.8 : 1.4; pMinPk=1.4; pMaxPk=2.4;
  }
  if (str===2) gpk+=0.4; else if (str===1) gpk+=0.2;
  if (h.age>=65) gpk=Math.max(gpk, lose? 1.6 : 1.4);
  if (f.kidney){ gpk=0.8; pMinPk=0.6; pMaxPk=0.8; }
  const pCap=target*0.35/4;
  let protein=Math.min(gpk*ref, pCap);
  const pMin=Math.min(pMinPk*ref, pCap), pMax=Math.min(pMaxPk*ref, pCap);

  const fatPct = style==="lower"? 0.40 : style==="higher"? 0.25 : 0.30;
  const fatFloor=Math.max(target*0.20/9, 0.5*Math.min(kg, ref*1.25));
  let fat=Math.max(target*fatPct/9, fatFloor);
  let carbs=(target-protein*4-fat*9)/4;
  const carbFloor = style==="lower"? 50 : 100;
  const notes=[];
  if (carbs<carbFloor){
    const takeF=Math.min((carbFloor-carbs)*4, Math.max(0,(fat-fatFloor)*9));
    fat-=takeF/9; carbs+=takeF/4;
    if (carbs<carbFloor && !f.kidney){
      const takeP=Math.min((carbFloor-carbs)*4, Math.max(0,(protein-pMin)*4));
      protein-=takeP/4; carbs+=takeP/4;
    }
  }
  if (f.diabetes && carbs*4/target>0.45){
    const excess=carbs*4-target*0.45; carbs-=excess/4; fat+=excess/9;
    notes.push("Carbs are capped at 45% of calories for steadier blood sugar.");
  }
  protein=round5(protein); fat=Math.round(fat);
  carbs=Math.max(0, Math.round((target-protein*4-fat*9)/4));
  const fiber=Math.max(25, Math.round(14*target/1000));
  return {protein, fat, carbs, fiber, ref, refLabel, gpk:protein/ref, pMin:round5(pMin), pMax:round5(pMax), fatPct:fat*9/target, carbPct:carbs*4/target, style, notes};
}

/* Learn the real daily burn: average logged intake minus the energy in the weight change over the last 4 weeks. */
function calibration(h, formulaTdee){
  if (!h || h.calibrate===false) return null;
  const S=St().S;
  const end=addDays(today(),-1), start=addDays(today(),-28), minDay=Math.max(800, formulaTdee*0.45);
  let sum=0, n=0;
  for (let d=start; d<=end; d=addDays(d,1)){ const t=St().dayTotals(d).kcal; if (t>=minDay){ sum+=t; n++; } }
  const ws=S.weights.filter(w=>w.date>=start && w.date<=today());
  const span = ws.length>1? (parseDay(ws[ws.length-1].date)-parseDay(ws[0].date))/864e5 : 0;
  const status={ready:false, days:n, needDays:10, weighIns:ws.length, needWeighIns:4, span, minDay};
  if (n<10 || ws.length<4 || span<14) return status;
  const t0=parseDay(ws[0].date).getTime(), xs=ws.map(w=>(parseDay(w.date).getTime()-t0)/864e5), ys=ws.map(w=>w.kg);
  const mx=xs.reduce((a,b)=>a+b)/xs.length, my=ys.reduce((a,b)=>a+b)/ys.length;
  let sxy=0, sxx=0; xs.forEach((x,i)=>{ sxy+=(x-mx)*(ys[i]-my); sxx+=(x-mx)**2; });
  const slope=sxx? sxy/sxx : 0;                                   // kg per day
  const avgIntake=sum/n, raw=avgIntake - slope*KCAL_PER_KG;
  const lo=formulaTdee*0.75, hi=formulaTdee*1.25, obs=Math.min(hi, Math.max(lo, raw));
  const weight=0.8*Math.min(1, n/21);                             // never fully drop the formula
  const tdee=formulaTdee*(1-weight)+obs*weight;
  return Object.assign(status, {ready:true, avgIntake, slopeWk:slope*7, observed:obs, clamped:raw!==obs, weight, tdee, ratio:tdee/formulaTdee});
}

function computePlan(h, kg){
  if (!h || !h.sex || !h.age || !h.heightCm || !kg) return null;
  const store=St(), wFmt=store.wFmt, wUnit=store.wUnit;
  const age=h.age, m2=(h.heightCm/100)**2, flags=h.flags||{};
  const bmi=kg/m2, minHealthyKg=18.5*m2;
  let goalKg=h.goalKg || null, notes=[], lose=true, pace=h.pace||"steady";
  if (!PACE_PCT[pace]) pace="steady";

  if (age<18){ lose=false; notes.push(["stop","You're under 18. Teens are still growing, so this plan won't set a calorie deficit. A doctor can help you with weight goals safely. The targets below are for maintaining your weight."]); }
  if (flags.pregnant){ lose=false; notes.push(["stop","During pregnancy or breastfeeding this plan won't set a calorie deficit, and your needs are usually higher than these numbers. Your doctor or midwife can tell you what's right for you."]); }
  if (bmi<18.5){ lose=false; notes.push(["stop","Your weight is already below the healthy range for your height, so this plan won't set a weight-loss target. If you're worried about your weight, please talk to a doctor."]); }
  if (lose && goalKg && goalKg<minHealthyKg){ goalKg=minHealthyKg; notes.push(["warn","Your goal is below the healthy range for your height. The plan aims for "+wFmt(minHealthyKg)+" "+wUnit()+" instead, the low end of healthy."]); }
  if (lose && goalKg && goalKg>=kg-0.2){ lose=false; notes.push(["info","You're at or below your goal weight. These targets will help you stay there."]); }
  if (lose && flags.ed){ pace="gentle"; notes.push(["warn","Because of your eating disorder history, the plan uses the gentle pace. Losing weight is safest with support from a doctor, therapist, or dietitian who knows your history. If tracking numbers starts to feel bad, it's OK to stop."]); }
  if (flags.diabetes) notes.push(["warn","Talk to your doctor before cutting calories, especially if you take insulin or other medicine that can cause low blood sugar. Your meal plans keep carbs steady through the day and favor high-fiber foods."]);
  if (flags.kidney) notes.push(["warn","Protein is set to 0.8 g per kg for kidney health. Ask your doctor or a dietitian for your exact protein and sodium limits."]);
  if (flags.bp) notes.push(["info","Your meal plans go easy on salt. Losing weight usually helps blood pressure too."]);

  const formula=energy(h, kg);
  const calib=calibration(h, formula.tdee);
  const ratio=calib && calib.ready? calib.ratio : 1;
  const E=energyTarget(h, kg, ratio, lose, pace);
  if (E.nearFloor) notes.push(["info","Your estimated daily burn is already close to "+fmt(E.floor)+" kcal, the lowest this app goes, so the plan doesn't cut calories further. More daily movement, like walks, is the way to create a deficit. A doctor or dietitian can help you find the right approach."]);
  if (E.floorHit) notes.push(["info","Your target is held at "+fmt(E.floor)+" kcal, the lowest this app goes, so you'll lose a bit slower than the pace you picked. Adding daily walks speeds it up without eating less."]);
  if (E.capPct) notes.push(["info","Your cut is limited to about "+g1(E.capPct*100)+"% of your body weight a week. At your size, going faster mostly costs muscle, not fat."]);
  const M=macroSplit(h, kg, E.target, lose);
  M.notes.forEach(t=>notes.push(["info",t]));
  const flex=round10(E.target*0.10);

  // Project the goal date week by week, since the burn (and the cut) shrink as weight comes off.
  let weeks=null;
  if (lose && goalKg && kg>goalKg && E.kgPerWeek>0.02){
    let w=kg, i=0;
    while (w>goalKg && i<520){ const s=energyTarget(h, w, ratio, true, pace); if (s.kgPerWeek<0.02){ i=null; break; } w-=s.kgPerWeek; i++; }
    weeks=i;
  }
  return Object.assign({}, M, {
    bmr:formula.bmr, method:formula.method, mult:formula.mult, formulaTdee:formula.tdee, tdee:E.tdee,
    target:E.target, deficit:E.deficit, pct:E.pct, lbPerWeek:E.lbPerWeek, kgPerWeek:E.kgPerWeek,
    flex, bmi, goalKg, goalBmi:goalKg? goalKg/m2 : null, weeks, lose, notes, pace, calib, kg
  });
}

function currentPlan(){ const S=St().S; return S.health? computePlan(S.health, St().latestKg()) : null; }

/* Today's goals: from the plan unless the person typed their own. */
function goals(){
  const S=St().S, p=currentPlan(), pr=S.profile;
  if (pr.goalsMode!=="custom" && p) return {goal:p.target, protein:p.protein, carbs:p.carbs, fat:p.fat, fiber:p.fiber, flex:p.flex, fromPlan:true};
  return {goal:pr.goal||2000, protein:pr.protein||0, carbs:pr.carbs||0, fat:pr.fat||0, fiber:Math.max(25, Math.round(14*(pr.goal||2000)/1000)), flex:0, fromPlan:false};
}

/* Trend weight: an exponentially smoothed average (like Happy Scale / MacroFactor), so one salty dinner doesn't look like a gain. */
function trend(weights){
  const out=[]; let t=null, prev=null;
  for (const w of weights){
    if (t==null) t=w.kg;
    else {
      const gap=Math.max(1, (parseDay(w.date)-parseDay(prev))/864e5);
      const a=1-Math.pow(0.9, gap);                                    // 10% per day, scaled for gaps
      t=t+a*(w.kg-t);
    }
    prev=w.date; out.push({date:w.date, kg:w.kg, trend:t});
  }
  return out;
}
/* Change in trend weight per week over the last ~3 weeks, kg. */
function trendPerWeek(weights){
  const tr=trend(weights); if (tr.length<3) return null;
  const last=tr[tr.length-1], cutoff=addDays(last.date,-21);
  const first=tr.find(p=>p.date>=cutoff) || tr[0];
  const days=(parseDay(last.date)-parseDay(first.date))/864e5;
  if (days<7) return null;
  return (last.trend-first.trend)/days*7;
}

CL.math = {ACT, MOVE, WORK, PACE_PCT, KCAL_PER_KG, energy, energyTarget, macroSplit, calibration, computePlan, currentPlan, goals, trend, trendPerWeek, hasBodyFat};
})();
