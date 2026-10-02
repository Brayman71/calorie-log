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
- **Meal plans:** 41 easy recipes with step-by-step guides.
  - The week is built around your diet, allergies, cooking time and favorite foods.
  - Dinners turn into next-day lunches.
  - Portions are scaled to your target.
  - You get a combined grocery list you can share, plus a prep plan.
- **Progress:**
  - Trend weight, which smooths out daily water swings.
  - Weekly rate and a projected goal date.
  - Calorie history and a forgiving streak.
  - Adaptive burn estimate: after about 2 weeks of logging, the app corrects its estimate of your daily burn.
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
| `js/recipes.js`, `js/planner.js` | Recipe book, week builder, grocery list |
| `js/scanner.js`, `js/foodapi.js` | Camera barcode reader, Open Food Facts / USDA lookups |
| `js/claude.js` | Optional Claude features (Anthropic SDK, your own key) |
| `js/store.js` | On-device storage, backup and restore |
| `js/today.js`, `js/addfood.js`, `js/plan-ui.js`, `js/progress.js`, `js/me.js`, `js/app.js` | Screens |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |

Food data: [Open Food Facts](https://world.openfoodfacts.org) (ODbL) and [USDA FoodData Central](https://fdc.nal.usda.gov). Barcode decoding: [barcode-detector](https://github.com/Sec-ant/barcode-detector) (ZXing).

This is general guidance, not medical advice.
