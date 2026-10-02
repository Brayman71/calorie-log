/* Smart orders at popular chains, from each chain's published nutrition info (checked Oct 2026).
   Shown in Add food → "Eating out?" and in search. Numbers are for the whole order. */
window.CL = window.CL || {};
CL.FASTFOOD = [
  {chain:"Chick-fil-A", checked:"checked Oct 2026",
   tip:"Swap the default dressing for Light Italian (25 kcal). On the Market Salad that saves about 200.",
   orders:[
    {name:"8-count grilled nuggets + side salad with Light Italian", kcal:315, protein:30, carbs:15, fat:14, parts:"8 ct grilled nuggets 130 · side salad 160 · Light Italian 25"},
    {name:"12-count grilled nuggets + Kale Crunch side + fruit cup", kcal:440, protein:43, carbs:31, fat:17, parts:"12 ct grilled nuggets 200 · Kale Crunch side 170 · fruit cup 70"},
    {name:"Grilled Chicken Sandwich + fruit cup", kcal:460, protein:29, carbs:61, fat:11, parts:"Grilled Chicken Sandwich 390 · fruit cup 70"},
    {name:"Market Salad with Light Italian", kcal:345, protein:28, carbs:29, fat:13, parts:"Market Salad, no dressing 320 · Light Italian 25"},
    {name:"Egg White Grill + fruit cup", kcal:370, protein:28, carbs:45, fat:8, parts:"Egg White Grill 300 · fruit cup 70"}
  ]},
  {chain:"Chipotle", checked:"checked Oct 2026",
   tip:"Skip the vinaigrette (220) and chips (540). Two salsas make a great dressing for almost nothing.",
   orders:[
    {name:"Chicken bowl: half white rice, black beans, fajita veggies, 2 salsas", kcal:470, protein:43, carbs:55, fat:11, parts:"chicken 180 · ½ white rice 100 · black beans 130 · fajita veggies 20 · tomato salsa 25 · green salsa 15"},
    {name:"Double-chicken salad: supergreens, black beans, veggies, salsas", kcal:580, protein:74, carbs:38, fat:16, parts:"double chicken 360 · supergreens 15 · black beans 130 · fajita veggies 20 · tomato salsa 25 · red salsa 30"},
    {name:"Steak bowl: half brown rice, pinto beans, veggies, green salsa, cheese", kcal:535, protein:38, carbs:50, fat:19, parts:"steak 150 · ½ brown rice 110 · pinto beans 130 · fajita veggies 20 · green salsa 15 · cheese 110"},
    {name:"3 chicken soft tacos with salsa, romaine, cheese", kcal:560, protein:44, carbs:45, fat:23, parts:"3 flour tortillas 240 · chicken 180 · tomato salsa 25 · romaine 5 · cheese 110"}
  ]},
  {chain:"Subway", checked:"checked Oct 2026",
   tip:"Mustard (10) or red wine vinegar (0) instead of mayo (100). Skipping cheese saves another 80–110.",
   orders:[
    {name:"6-inch Grilled Chicken & Avocado", kcal:450, protein:35, carbs:44, fat:16, parts:"6-inch Grilled Chicken & Fresh Avocado 450"},
    {name:"6-inch Sweet Onion Teriyaki Chicken", kcal:430, protein:29, carbs:55, fat:11, parts:"6-inch Sweet Onion Teriyaki 430"},
    {name:"Subway Club Protein Bowl with red wine vinegar", kcal:410, protein:44, carbs:16, fat:21, parts:"Subway Club Protein Bowl 410 · red wine vinegar 0"},
    {name:"Footlong Ham & Turkey Stacker", kcal:580, protein:40, carbs:84, fat:10, parts:"2 × 6-inch Ham & Turkey 290"},
    {name:"Baja Chicken Protein Pocket", kcal:330, protein:24, carbs:30, fat:13, parts:"Baja Chicken Protein Pocket 330"}
  ]},
  {chain:"McDonald's", checked:"checked Oct 2026",
   tip:"Apple slices (15) instead of small fries (230), and a diet soda or water.",
   orders:[
    {name:"Egg McMuffin + small black coffee", kcal:315, protein:17, carbs:31, fat:13, parts:"Egg McMuffin 310 · small coffee 5"},
    {name:"McDouble + apple slices", kcal:405, protein:22, carbs:36, fat:20, parts:"McDouble 390 · apple slices 15"},
    {name:"3 McCrispy Strips + Tangy BBQ + apple slices", kcal:460, protein:31, carbs:39, fat:20, parts:"3 pc McCrispy Strips 400 · Tangy BBQ 45 · apple slices 15"},
    {name:"Quarter Pounder with Cheese + Diet Coke", kcal:520, protein:30, carbs:42, fat:26, parts:"Quarter Pounder with Cheese 520 · Diet Coke 0"},
    {name:"Hamburger + 6 McNuggets + Tangy BBQ", kcal:545, protein:26, carbs:56, fat:24, parts:"Hamburger 250 · 6 pc McNuggets 250 · Tangy BBQ 45"}
  ]},
  {chain:"Starbucks", checked:"checked Oct 2026",
   tip:"Ask for nonfat milk and half the syrup pumps, and skip the whipped cream.",
   orders:[
    {name:"Spinach, Feta & Egg White Wrap + grande Cappuccino", kcal:430, protein:29, carbs:48, fat:13, parts:"Spinach Feta & Egg White Wrap 290 · grande Cappuccino 140"},
    {name:"Turkey Bacon & Egg White Sandwich + grande Iced Vanilla Protein Latte", kcal:530, protein:46, carbs:61, fat:13, parts:"Turkey Bacon Cheddar & Egg White Sandwich 260 · grande Iced Vanilla Protein Latte 270"},
    {name:"Egg White & Red Pepper Egg Bites + oatmeal", kcal:330, protein:17, carbs:39, fat:11, parts:"Egg White & Roasted Red Pepper Egg Bites 170 · Rolled & Steel-Cut Oatmeal 160"},
    {name:"Chicken Bacon Protein Pocket + grande Iced Protein Matcha", kcal:570, protein:51, carbs:54, fat:18, parts:"Chicken Bacon Protein Pocket 310 · grande Iced Protein Matcha 260"}
  ]},
  {chain:"Taco Bell", checked:"checked Oct 2026",
   tip:"Skip the Avocado Verde packet (50) and sour cream. Hot sauce packets are basically free.",
   orders:[
    {name:"2 Cantina Chicken Soft Tacos + black beans", kcal:470, protein:27, carbs:45, fat:22, parts:"2 × Cantina Chicken Soft Taco 210 (no Avocado Verde packet) · black beans 50"},
    {name:"Chicken Burrito Supreme + Crunchy Taco", kcal:540, protein:26, carbs:62, fat:20, parts:"Burrito Supreme, chicken 370 · Crunchy Taco 170"},
    {name:"Chicken Quesadilla", kcal:490, protein:26, carbs:44, fat:23, parts:"Chicken Quesadilla 490"},
    {name:"3-Cheese Chicken Flatbread Melt + Cantina Chicken Soft Taco", kcal:530, protein:32, carbs:49, fat:24, parts:"3-Cheese Chicken Flatbread Melt 320 · Cantina Chicken Soft Taco 210"}
  ]},
  {chain:"Panera", checked:"checked Oct 2026",
   tip:"Pick an apple or fruit cup instead of the free baguette (190), and get dressing on the side.",
   orders:[
    {name:"Green Goddess Cobb Salad with Chicken, no baguette", kcal:580, protein:40, carbs:30, fat:34, parts:"Green Goddess Cobb with Chicken, whole 580"},
    {name:"Asian Sesame Salad with Chicken, no baguette", kcal:530, protein:29, carbs:35, fat:31, parts:"Asian Sesame Salad with Chicken, whole 530"},
    {name:"You Pick 2: half Green Goddess Cobb + chicken noodle soup", kcal:470, protein:34, carbs:36, fat:22, parts:"half Green Goddess Cobb 290 · chicken noodle soup, bowl 180"},
    {name:"Avocado, Egg White & Spinach Sandwich + fruit cup", kcal:410, protein:19, carbs:54, fat:14, parts:"Avocado, Egg White & Spinach Sandwich 350 · fruit cup 60"},
    {name:"Chicken Roma Asiago Bagel Stack", kcal:610, protein:31, carbs:59, fat:27, parts:"Chicken Roma Asiago Bagel Stack 610"}
  ]},
  {chain:"Wendy's", checked:"checked Oct 2026",
   tip:"A small chili and plain baked potato beats a burger and fries. Using half the Caesar packet saves 120.",
   orders:[
    {name:"Grilled Chicken Wrap + Apple Bites", kcal:455, protein:28, carbs:49, fat:16, parts:"Grilled Chicken Wrap 420 · Apple Bites 35"},
    {name:"Parmesan Caesar Salad with half the dressing", kcal:390, protein:32, carbs:13, fat:24, parts:"Parmesan Caesar Salad 270 · ½ Caesar dressing 120"},
    {name:"Apple Pecan Salad with dressing", kcal:510, protein:30, carbs:43, fat:25, parts:"Apple Pecan Salad 420 · Pomegranate Vinaigrette 90 (seasonal)"},
    {name:"Small chili + plain baked potato", kcal:550, protein:26, carbs:85, fat:12, parts:"small chili 280 · plain baked potato 270"},
    {name:"Double Stack + Apple Bites", kcal:415, protein:23, carbs:33, fat:21, parts:"Double Stack 380 · Apple Bites 35"}
  ]},
  {chain:"Panda Express", checked:"checked Oct 2026",
   tip:"Super Greens (130) as your base instead of chow mein or fried rice (about 600). Extra teriyaki sauce adds 70.",
   orders:[
    {name:"Bowl: Super Greens + Grilled Teriyaki Chicken", kcal:410, protein:42, carbs:28, fat:14, parts:"Super Greens 130 · Grilled Teriyaki Chicken 280"},
    {name:"Plate: Super Greens + Black Pepper Sirloin + String Bean Chicken", kcal:550, protein:40, carbs:40, fat:26, parts:"Super Greens 130 · Black Pepper Sirloin Steak 210 · String Bean Chicken 210"},
    {name:"Bowl: half rice, half Super Greens + Grilled Teriyaki Chicken", kcal:605, protein:43, carbs:80, fat:12, parts:"½ white rice 260 · ½ Super Greens 65 · Grilled Teriyaki Chicken 280"},
    {name:"Plate: Super Greens + Teriyaki Chicken + Chili Crisp Shrimp", kcal:620, protein:55, carbs:47, fat:24, parts:"Super Greens 130 · Grilled Teriyaki Chicken 280 · Chili Crisp Shrimp 210"},
    {name:"Bowl: Super Greens + Black Pepper Sirloin + Hot & Sour Soup", kcal:460, protein:35, carbs:41, fat:19, parts:"Super Greens 130 · Black Pepper Sirloin Steak 210 · Hot & Sour Soup 120"}
  ]},
  {chain:"Jersey Mike's", checked:"checked Oct 2026",
   tip:"Order Mike's Way without the oil (saves about 250 on a Regular), or get it as a Sub in a Tub to skip the bread.",
   orders:[
    {name:"#7 Turkey & Provolone, Regular, vinegar only", kcal:567, protein:45, carbs:66, fat:13, parts:"turkey 111 · provolone 118 · white bread 309 · lettuce, tomato, onion 25 · vinegar & oregano 4"},
    {name:"#7 Sub in a Tub, extra turkey + avocado, no oil", kcal:364, protein:43, carbs:12, fat:17, parts:"turkey 149 · provolone 118 · avocado 68 · lettuce, tomato, onion 25 · vinegar & oregano 4"},
    {name:"#16 Chicken Philly, Regular", kcal:684, protein:48, carbs:73, fat:22, parts:"chicken 191 · white American 153 · peppers & onions 31 · white bread 309"},
    {name:"#6 Roast Beef & Provolone, Mini, vinegar only", kcal:439, protein:38, carbs:43, fat:12, parts:"roast beef 137 · provolone 78 · white bread 204 · lettuce, tomato, onion 17 · vinegar & oregano 3"}
  ]},
  {chain:"Sweetgreen", checked:"checked Oct 2026",
   tip:"Ask for light dressing or dressing on the side and use about half. Seasonal bowls rotate.",
   orders:[
    {name:"Chicken Pesto Parm", kcal:525, protein:35, carbs:38, fat:23, parts:"as served 525"},
    {name:"Kale Caesar", kcal:545, protein:41, carbs:18, fat:35, parts:"as served 545"},
    {name:"Guacamole Greens", kcal:555, protein:29, carbs:35, fat:32, parts:"as served 555"},
    {name:"Steak Honey Crunch", kcal:625, protein:33, carbs:48, fat:33, parts:"as served 625"},
    {name:"Chicken Sesame Crunch", kcal:615, protein:35, carbs:54, fat:29, parts:"as served 615"}
  ]},
  {chain:"Dunkin'", checked:"checked Oct 2026",
   tip:"Skim milk and no liquid sugar or swirl. The Protein Iced Latte with sugar-free vanilla is still 170.",
   orders:[
    {name:"Turkey Sausage + Egg & Cheese Wake-Up Wraps + medium Protein Iced Latte", kcal:580, protein:33, carbs:43, fat:31, parts:"Turkey Sausage Wake-Up Wrap 230 · Egg & Cheese Wake-Up Wrap 180 · Protein Iced Latte 170"},
    {name:"Bacon & Cheddar Omelet Bites + Avocado Toast + iced coffee with skim", kcal:540, protein:25, carbs:43, fat:30, parts:"Omelet Bites 280 · Avocado Toast 240 · iced coffee with skim 20"},
    {name:"Egg & Cheese English Muffin + medium Protein Iced Latte", kcal:510, protein:29, carbs:52, fat:21, parts:"Egg & Cheese on English Muffin 340 · Protein Iced Latte 170"},
    {name:"2 Turkey Sausage Wake-Up Wraps + iced coffee with skim", kcal:480, protein:24, carbs:32, fat:30, parts:"2 × Turkey Sausage Wake-Up Wrap 230 · iced coffee with skim 20"}
  ]},
  {chain:"Five Guys", checked:"checked Oct 2026",
   tip:"Get it in a bowl or lettuce wrap instead of the bun (saves 240), skip the fries (a Little Fries is 526), and pile on free veggies.",
   orders:[
    {name:"Little Hamburger with veggies and mustard", kcal:570, protein:23, carbs:45, fat:26, parts:"patty 302 · bun 240 · lettuce, tomato, grilled onions & mushrooms 28 · pickles, mustard 0"},
    {name:"Hamburger (2 patties) in a lettuce wrap, loaded veggies", kcal:632, protein:32, carbs:6, fat:34, parts:"2 patties 604 · lettuce, tomato, grilled onions & mushrooms 28 · mustard, hot sauce 0"},
    {name:"Little Cheeseburger lettuce wrap with veggies", kcal:397, protein:20, carbs:5, fat:23, parts:"patty 302 · cheese 70 · lettuce, tomato, grilled onions, jalapeños 25 · pickles, mustard 0"}
  ]}
];
