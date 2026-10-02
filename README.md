# Calorie Log

A calm calorie tracker for iPhone, built as a web app you add to your home screen.

## What it does

- **Barcode scanner:** uses the phone camera. Products come from Open Food Facts, with USDA FoodData Central as the backup. Every scanned food is saved, so scanning it again works offline.
- **Fast logging:**
  - Search your own foods, 60 common foods, the recipe book, and both online databases.
  - Recent foods and favorites.
  - Quick add (just a calorie number).
  - Saved meals.
  - Copy yesterday, or copy a single meal.
  - Log by servings or by grams.
- **Daily targets without the guilt:**
  - Calorie and protein targets from your answers in **Me**.
  - A daily treat allowance.
  - Neutral colors when you go over.
  - A weekly budget, so lighter days bank calories for bigger ones.
- **Recipe book:** 85 easy recipes with step-by-step guides.
  - 45 are lighter, higher-protein versions of the most popular recipes of recent years, from Google's yearly trending lists, TikTok, NYT Cooking, Allrecipes and others. Each one says why it's popular.
  - Filter by meal or Popular, search by ingredient, and log a serving in one tap.
- **Meal plans:** built for you from the recipe book, or hand-picked. Star favorites, add any recipe to any day (with next-day leftovers), or start an empty week and choose each meal.
  - The week is built around your diet, allergies, cooking time and favorite foods.
  - Dinners turn into next-day lunches.
  - Portions are scaled to your target.
  - You get a combined grocery list you can share, plus a prep plan.
- **Progress:**
  - Trend weight, which smooths out daily water swings.
  - Weekly rate and a projected goal date.
  - Calorie history and a forgiving streak.
  - Adaptive burn estimate: after about 2 weeks of logging, the app corrects its estimate of your daily burn.
- **Check-ins:** a morning card (weigh in, breakfast, water) and an evening card on Today, plus a weekly check-in on Progress with one thing to try next week.
- **Eating out:** smart orders at 13 chains (Chick-fil-A, Chipotle, Subway, McDonald's, Starbucks, Taco Bell, Panera, Wendy's, Panda Express, Jersey Mike's, Sweetgreen, Dunkin', Five Guys) from their published nutrition info, one tap to log.
- **Water tracking.**
- **Optional Claude features** (needs your own Anthropic API key, set in **Me → Settings**):
  - Custom-written weekly meal plans.
  - Recipe swaps.
  - Reading nutrition labels from a photo.
  - Estimating a plated meal from a photo.
- **Works offline and stays on your phone.** There's no account and no server. Use **Me → Settings → Backup** to move your data or keep a copy.

## Install on iPhone

1. Open the app's GitHub Pages link in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the home screen.
4. The first time you scan, tap **Allow** for the camera.

Data logged in a Safari tab stays separate from the home-screen app, so install the app first.

## Run it on a computer

```
node tools/dev-server.js
```

Then open http://localhost:8642. The camera needs either `localhost` or `https`.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `css/app.css` | Page shell and styles |
| `js/plan-math.js` | Calorie target, macros and fiber, adaptive burn estimate, trend weight |
| `js/recipes.js`, `js/recipes-popular.js`, `js/planner.js` | Recipe book (classic and popular recipes), week builder, grocery list |
| `js/fastfood.js` | Eating-out orders by chain (checked Oct 2026) |
| `js/scanner.js`, `js/foodapi.js` | Camera barcode reader, Open Food Facts / USDA lookups |
| `js/claude.js` | Optional Claude features (Anthropic SDK, your own key) |
| `js/store.js` | On-device storage, backup and restore |
| `js/today.js`, `js/addfood.js`, `js/plan-ui.js`, `js/progress.js`, `js/me.js`, `js/app.js` | Screens |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |

Food data: [Open Food Facts](https://world.openfoodfacts.org) (ODbL) and [USDA FoodData Central](https://fdc.nal.usda.gov). Barcode decoding: [barcode-detector](https://github.com/Sec-ant/barcode-detector) (ZXing).

This is general guidance, not medical advice.
