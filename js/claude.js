/* Optional Claude features, using your own Anthropic API key (stored only on this phone):
   - write a custom week of recipes
   - swap a single meal for something new
   - read a nutrition label from a photo
   - estimate a plated meal from a photo
   Uses the official Anthropic TypeScript SDK, loaded from jsDelivr the first time it's needed. */
window.CL = window.CL || {};
(function(){
const SDK_URL="https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm";
const MODEL="claude-opus-5-5";
const U=CL.util;
let sdk=null;

async function client(){
  const key=CL.store.getApiKey();
  if (!key) throw Object.assign(new Error("No API key"), {code:"nokey"});
  if (!sdk) sdk=await import(SDK_URL);
  const Anthropic=sdk.default || sdk.Anthropic;
  // The key belongs to the person using the app and never leaves their phone except to call Anthropic.
  return new Anthropic({apiKey:key, dangerouslyAllowBrowser:true, maxRetries:2});
}

/* One streamed request with a JSON schema, returning the parsed object. */
async function askJSON({content, schema, effort, maxTokens, signal, onText}){
  const c=await client();
  const stream=c.messages.stream({
    model:MODEL,
    max_tokens:maxTokens||8000,
    output_config:{effort:effort||"medium", format:{type:"json_schema", schema}},
    messages:[{role:"user", content}]
  }, {signal});
  if (onText){ let text=""; stream.on("text", d=>{ text+=d; onText(text); }); }
  const msg=await stream.finalMessage();
  if (msg.stop_reason==="refusal") throw Object.assign(new Error("refused"), {code:"refusal"});
  if (msg.stop_reason==="max_tokens") throw Object.assign(new Error("too long"), {code:"truncated"});
  const block=(msg.content||[]).find(b=>b.type==="text");
  if (!block) throw Object.assign(new Error("empty"), {code:"invalid_json"});
  try { return JSON.parse(block.text); }
  catch(e){ throw Object.assign(new Error("bad json"), {code:"invalid_json"}); }
}

/* Cheap check that a pasted key works. */
async function testKey(){
  const c=await client();
  await c.messages.create({model:MODEL, max_tokens:64, output_config:{effort:"low"}, messages:[{role:"user", content:"Reply with OK."}]});
  return true;
}

function errorText(e){
  const code=e && e.code, status=e && e.status;
  if (code==="nokey") return "Add your Anthropic API key in Settings to use this.";
  if (code==="refusal") return "Claude couldn't help with that one. Try different wording, or use the built-in recipes.";
  if (code==="unreadable") return "Couldn't read that photo. Try again closer, in good light, with the label or plate filling the frame.";
  if (code==="image") return "Couldn't open that photo. Try a different one.";
  if (code==="truncated" || code==="invalid_json") return "Claude's answer came back incomplete. Try again.";
  if (e && (e.name==="AbortError" || e.name==="APIUserAbortError")) return "Stopped.";
  if (status===401) return "That API key didn't work. Check it in Settings (it starts with sk-ant-).";
  if (status===403) return "This API key doesn't have permission to use Claude. Check it in the Claude Console.";
  if (status===429) return "Too many requests right now, or your monthly spend limit was reached. Wait a minute and try again.";
  if (status===400 && /credit|billing|balance/i.test(e.message||"")) return "Your Anthropic account is out of credits. Add credits in the Claude Console, or use the built-in recipes.";
  if (status===529 || status>=500) return "Claude is busy right now. Try again in a minute.";
  if (navigator.onLine===false) return "You're offline. Claude features need internet; the built-in recipes work offline.";
  return "Something went wrong talking to Claude. Try again.";
}

/* ---------- Meal plans ---------- */
const MEAL_ENUM=["breakfast","lunch","dinner","snack"];
const RECIPE_SCHEMA={
  type:"object", additionalProperties:false,
  required:["id","name","meal","minutes","servings","kcal","protein","carbs","fat","fiber","ingredients","steps","tip"],
  properties:{
    id:{type:"string"}, name:{type:"string"}, meal:{type:"string", enum:MEAL_ENUM},
    minutes:{type:"integer"}, servings:{type:"integer"},
    kcal:{type:"integer"}, protein:{type:"integer"}, carbs:{type:"integer"}, fat:{type:"integer"}, fiber:{type:"integer"},
    ingredients:{type:"array", items:{type:"string"}}, steps:{type:"array", items:{type:"string"}}, tip:{type:"string"}
  }
};
const PLAN_SCHEMA={
  type:"object", additionalProperties:false, required:["summary","recipes","days","prep","grocery"],
  properties:{
    summary:{type:"string"},
    recipes:{type:"array", items:RECIPE_SCHEMA},
    days:{type:"array", items:{type:"object", additionalProperties:false, required:["day","breakfast","lunch","dinner","snack"],
      properties:{day:{type:"string"}, breakfast:{type:"string"}, lunch:{type:"string"}, dinner:{type:"string"}, snack:{type:"string"}}}},
    prep:{type:"array", items:{type:"string"}},
    grocery:{type:"array", items:{type:"object", additionalProperties:false, required:["section","items"],
      properties:{section:{type:"string"}, items:{type:"array", items:{type:"string"}}}}}
  }
};

function constraintsText(h){
  const f=h.flags||{};
  const diet={any:"Eats everything", vegetarian:"Vegetarian (no meat or fish; eggs and dairy are fine)", pescatarian:"Pescatarian (fish and seafood are fine, no other meat)", vegan:"Vegan (no animal products at all)"}[h.diet||"any"];
  const n=h.household||1, people=n+(n===1? " person" : " people");
  const lines=[
    "- Diet: "+diet+".",
    "- Never include: "+(h.avoid||"nothing specific")+".",
    "- Foods they love (work several in): "+(h.loves||"not specified")+".",
    "- Cooking skill: "+(h.skill==="comfortable"? "comfortable home cook" : "beginner, so explain any technique in plain words")+". Dinners take at most "+(h.cookTime||30)+" minutes of hands-on time; breakfasts, lunches and snacks take at most 10 minutes or need no cooking.",
    "- Grocery budget: "+(h.budget||"moderate")+".",
    "- Cooking for "+people+"."
  ];
  if (f.diabetes) lines.push("- Has diabetes or prediabetes: spread carbs evenly across meals, favor high-fiber carbs, no sugary drinks.");
  if (f.bp) lines.push("- Has high blood pressure: keep sodium moderate; go easy on salt, cured meats and salty sauces, and suggest low-sodium versions.");
  if (f.kidney) lines.push("- Has kidney disease: keep protein moderate, close to the protein target and not above it; go easy on salt.");
  if (f.pregnant) lines.push("- Pregnant or breastfeeding: no high-mercury fish, nothing raw or undercooked (eggs, meat, fish), no unpasteurized cheese, and only deli meat that is heated until steaming.");
  return lines.join("\n");
}

function planPrompt(p, h, req, avoidNames){
  const mealsKcal=p.target-p.flex, n=h.household||1, people=n+(n===1? " person" : " people");
  return [
"Plan one week of easy, tasty meals for someone losing weight who wants a way of eating that doesn't make life miserable.",
"",
"DAILY TARGETS",
"- Breakfast + lunch + dinner + one snack together: about "+mealsKcal+" kcal a day (stay within 80 either way). They also have a separate "+p.flex+" kcal daily treat allowance to spend on anything, so don't plan desserts to use it up.",
"- About "+p.protein+" g protein (at least "+p.pMin+" g), "+p.carbs+" g carbs and "+p.fat+" g fat a day. Protein matters most; carbs and fat can be off by 15%.",
"- At least "+p.fiber+" g fiber a day from vegetables, beans, fruit and whole grains, so smaller portions still feel filling.",
"",
"ABOUT THEM",
constraintsText(h),
req? "- This week they asked for: "+req : "",
avoidNames.length? "- Don't repeat these recent recipes: "+avoidNames.join("; ")+"." : "",
"",
"MAKE IT EASY TO STICK TO",
"- Use 2 breakfast recipes and 2 snack recipes, each repeated through the week.",
"- Use 4 or 5 dinner recipes. Most lunches are the previous night's dinner leftovers: put that dinner's recipe id in the next day's lunch slot. Add at most 2 separate lunch recipes for days without leftovers.",
"- Common supermarket ingredients that overlap between recipes so little goes to waste.",
"- Food that tastes good: real seasoning, sauces, and lighter versions of comfort food. Avoid sad diet food like plain chicken breast with steamed broccoli.",
"- Each recipe has at most 9 ingredients (amounts for the full recipe, e.g. \"1 cup rolled oats\") and at most 6 short steps a beginner can follow.",
"- Recipe servings cover "+people+", and dinners make enough extra for the next day's lunch.",
"- kcal, protein, carbs, fat and fiber are honest per-serving estimates.",
"",
"\"days\" has exactly 7 entries, Mon through Sun, and every slot holds a recipe id from \"recipes\". The grocery list covers the whole week with combined amounts, grouped by store section (Produce, Meat & seafood, Dairy & eggs, Bakery, Canned & jars, Grains & pasta, Frozen, Pantry). \"prep\" has 3 to 5 short steps. \"summary\" is 1-2 friendly sentences about the week."
  ].filter(x=>x!=="").join("\n");
}

function normalizeRecipe(r, fallbackMeal){
  if (!r || typeof r!=="object" || !r.name) return null;
  const ingredients=U.arr(r.ingredients,16,140), steps=U.arr(r.steps,10,500);
  if (!ingredients.length || !steps.length) return null;
  return {
    id:U.str(r.id,24)||("r"+U.uid()), name:U.str(r.name,90), meal:MEAL_ENUM.includes(r.meal)? r.meal : fallbackMeal,
    minutes:Math.round(U.clampNum(r.minutes,0,300)), servings:Math.max(1,Math.round(U.clampNum(r.servings,1,12))),
    kcal:Math.round(U.clampNum(r.kcal,0,3000)), protein:Math.round(U.clampNum(r.protein,0,300)), carbs:Math.round(U.clampNum(r.carbs,0,400)),
    fat:Math.round(U.clampNum(r.fat,0,200)), fiber:Math.round(U.clampNum(r.fiber,0,100)),
    ingredients, steps, tip:U.str(r.tip,300), tags:[], allergens:[]
  };
}
function normalizePlan(d){
  if (!d || !Array.isArray(d.recipes) || !Array.isArray(d.days)) return null;
  const recipes=[], seen=new Set();
  for (const raw of d.recipes.slice(0,24)){ const r=normalizeRecipe(raw,"dinner"); if (r && !seen.has(r.id)){ seen.add(r.id); recipes.push(r); } }
  if (!recipes.length) return null;
  const days=CL.planner.DAYN.map((n,i)=>{ const src=d.days[i]||{}, o={}; for (const s of MEAL_ENUM){ const id=src[s]==null? "" : String(src[s]); o[s]=seen.has(id)? id : null; } return o; });
  if (!days.some(dd=>MEAL_ENUM.some(s=>dd[s]))) return null;
  const grocery=(Array.isArray(d.grocery)? d.grocery : []).slice(0,14).map(g=>({section:U.str(g && g.section,40)||"Other", items:U.arr(g && g.items,50,120)})).filter(g=>g.items.length);
  const plan={source:"claude", factor:1, summary:U.str(d.summary,500), recipes, days, prep:U.arr(d.prep,8,400), grocery, checked:{}, createdAt:Date.now()};
  const n=CL.planner.usage(plan); plan.recipes.forEach(r=>{ r.eaten=n[r.id]||0; });
  return plan;
}

async function planWeek(p, h, req, avoidNames, opts){
  const data=await askJSON({content:planPrompt(p, h, req, avoidNames||[]), schema:PLAN_SCHEMA, effort:"medium", maxTokens:16000, signal:opts&&opts.signal, onText:opts&&opts.onText});
  const plan=normalizePlan(data);
  if (!plan) throw Object.assign(new Error("bad plan"), {code:"invalid_json"});
  return plan;
}

async function swapRecipe(p, h, slot, current, weekNames){
  const kcal=current? current.kcal : Math.round((p.target-p.flex)/4);
  const prompt=[
"Suggest one replacement "+slot+" recipe for someone losing weight who wants food that tastes good and is easy to make.",
"- About "+kcal+" kcal per serving (within 60), with solid protein.",
constraintsText(h),
current? "- They want something different from: "+current.name+"." : "",
"- Don't repeat anything already in their week: "+weekNames.join("; ")+".",
"- At most 9 ingredients (amounts for the full recipe) and at most 6 short steps.",
"- grocery_additions lists only items to buy that the rest of the week doesn't already use."
  ].filter(Boolean).join("\n");
  const schema={type:"object", additionalProperties:false, required:["recipe","grocery_additions"], properties:{recipe:RECIPE_SCHEMA, grocery_additions:{type:"array", items:{type:"string"}}}};
  const res=await askJSON({content:prompt, schema, effort:"low", maxTokens:6000});
  const r=normalizeRecipe(res && res.recipe, slot);
  if (!r) throw Object.assign(new Error("bad recipe"), {code:"invalid_json"});
  r.id="c"+U.uid(); r.meal=slot;
  return {recipe:r, additions:U.arr(res.grocery_additions,15,120)};
}

/* ---------- Photos ---------- */
/* Shrink a photo to ~1280px JPEG so it uploads fast and costs less. */
function fileToJpeg(file, max){
  max=max||1280;
  return new Promise((resolve, reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{
      const k=Math.min(1, max/Math.max(img.naturalWidth, img.naturalHeight));
      const c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(Object.assign(new Error("bad image"), {code:"image"})); };
    img.src=url;
  });
}
function imageBlock(b64){ return {type:"image", source:{type:"base64", media_type:"image/jpeg", data:b64}}; }

const LABEL_SCHEMA={type:"object", additionalProperties:false,
  required:["readable","name","serving","kcal","protein","carbs","fat","fiber"],
  properties:{readable:{type:"boolean"}, name:{type:"string"}, serving:{type:"string"},
    kcal:{type:"number"}, protein:{type:"number"}, carbs:{type:"number"}, fat:{type:"number"}, fiber:{type:"number"}}};
async function readLabel(file, hint){
  const b64=await fileToJpeg(file, 1568);
  const text="This is a photo of a food package's Nutrition Facts (or nutrition information) panel. Read the values for ONE serving as printed. "+
    "If the label only shows per-100 g values, use those and set serving to \"100 g\". Total carbohydrate, not net carbs. "+
    "name: the product name if visible on the photo"+(hint? " (the person says it's: "+hint+")" : "")+", otherwise a short description. "+
    "Set readable to false if you can't read a nutrition panel in the photo.";
  const d=await askJSON({content:[imageBlock(b64), {type:"text", text}], schema:LABEL_SCHEMA, effort:"low", maxTokens:4000});
  if (!d.readable) throw Object.assign(new Error("unreadable"), {code:"unreadable"});
  return {name:U.str(d.name,90)||"Packaged food", serving:U.str(d.serving,60)||"1 serving", kcal:Math.round(d.kcal||0),
    protein:U.g1(d.protein||0)*1, carbs:U.g1(d.carbs||0)*1, fat:U.g1(d.fat||0)*1, fiber:U.g1(d.fiber||0)*1, src:"photo"};
}

const MEAL_SCHEMA={type:"object", additionalProperties:false, required:["name","items","note"],
  properties:{name:{type:"string"}, note:{type:"string"},
    items:{type:"array", items:{type:"object", additionalProperties:false, required:["name","portion","kcal","protein","carbs","fat"],
      properties:{name:{type:"string"}, portion:{type:"string"}, kcal:{type:"number"}, protein:{type:"number"}, carbs:{type:"number"}, fat:{type:"number"}}}}}};
async function estimateMeal(file, description){
  const b64=await fileToJpeg(file, 1280);
  const text="Estimate the calories and macros in this meal photo. List each food you can see with a realistic portion (cups, ounces or pieces). "+
    "Count cooking oil, butter, dressings and sauces you can reasonably expect, because photo estimates usually miss them. "+
    (description? "The person says: \""+description.slice(0,200)+"\". " : "")+
    "name: a short name for the whole meal. note: one short sentence about what's most uncertain (e.g. hidden oil, portion size).";
  const d=await askJSON({content:[imageBlock(b64), {type:"text", text}], schema:MEAL_SCHEMA, effort:"low", maxTokens:5000});
  const items=(d.items||[]).slice(0,12).map(i=>({name:U.str(i.name,60), portion:U.str(i.portion,40), kcal:Math.round(i.kcal||0), protein:Math.round(i.protein||0), carbs:Math.round(i.carbs||0), fat:Math.round(i.fat||0)}));
  if (!items.length) throw Object.assign(new Error("no food"), {code:"unreadable"});
  return {name:U.str(d.name,90)||"Meal", note:U.str(d.note,200), items};
}

CL.claude = {hasKey:()=>!!CL.store.getApiKey(), testKey, planWeek, swapRecipe, readLabel, estimateMeal, errorText, MODEL};
})();
