# Heredita

A roleplay geopolitical simulator — paint the map, roll the dice, rewrite history.

Static marketing + sign-in site. The game itself lives at <https://app.heredita.net/app/>.

## Stack

Plain HTML + CSS + vanilla JS. No build step.

## Local dev

```bash
cd site
python -m http.server 8000
# open http://localhost:8000/
```

## Deploy

Configured for Vercel via `vercel.json` (publish dir = `site/`).

1. Import this repo on <https://vercel.com/new>
2. Framework Preset: **Other**
3. Build command: *(none)*
4. Output directory: `site` (already declared in `vercel.json`)
5. Deploy

## Structure

```
site/
├── index.html      auth landing (sign up / sign in / guest)
├── home.html       dashboard
├── play.html       launch page + preview footage carousel
├── about.html      mission + features
├── updates.html    patch notes
├── terms.html      placeholder T&C
├── css/chalkboard.css
├── js/app.js       PLAY_URL points to app.heredita.net
└── assets/         logos + 5 screenshots
```
