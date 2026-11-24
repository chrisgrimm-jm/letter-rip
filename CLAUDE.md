# Letter Rip: notes for Claude

A spin-and-solve word puzzle game for Jomboy Media live shows. It's plain HTML, CSS and JS with no build step and no npm. It deploys to GitHub Pages from `main` (https://chrisgrimm-jm.github.io/letter-rip/), so anything pushed to `main` goes live in a minute or two.

## Files
- `index.html`: host page with all controls, plus the Setup overlay.
- `display.html`: audience page (TV, projector or OBS Browser Source at 1920×1080). Same board markup as the host page, with no controls.
- `app.js`: shared by both pages. `HOST` (from `<body data-role>`) splits host-only code (the block at the bottom) from the shared drawing code.
- `style.css`: shared styles.

## How it works
- The host owns all game state in `g`. Every host action mutates `g`, queues effects with `fx(type, data)` (tile flips, sounds), then calls `render()`.
- `render()` draws the page, runs queued effects locally, saves `g` to localStorage (so a host refresh restores the game), and publishes `{g, view, fx}` as **one JSON string** to Firebase Realtime Database at `letterrip/<room>/state`.
- The display subscribes to that path, replaces `g`, calls `draw()`, and replays `fx` when `g.fxId` changes. It skips replay on first load. The display never writes.
- Firebase is the shared Jomboy project `pinpoint-abf21` (compat SDK 10.12.5). The config in `app.js` is meant to be public.
- Settings (`cfg`: puzzles, names, prizes, wedges, title, room code) live in the host browser's localStorage under `wnf`. The game is stored under `wnf-game`.
- Puzzle layout: `layout()` word-wraps onto 4 rows of 14 tiles. Setup rejects puzzles that don't fit.
- Rounds (`g.mode`): `normal`, `toss` (auto-reveal timer, buzz in with a player click or keys 1–4), `speed` (one spin sets the value, vowels free, turn passes every letter), and `bonus` (free letters, then picks, then a clock).
- Sounds are synthesized with WebAudio (`sfx`). There are no audio or image files.

## Design rules
- The look is a **hand-operated ballpark scoreboard**: green painted planks with a cream pinstripe, off-white number-plate tiles with screws, amber dot-matrix LED strips, turn bulbs, and a brass-pegged wheel. Keep new UI inside that theme.
- Avoid the generic "AI template" look: no italic display type, pill buttons, or colored offset "sticker" shadows.
- Fonts: Bebas Neue (display), Sofia Sans Extra Condensed and Semi Condensed. Jomboy red `#E40000` and blue `#00B7FF` are accents.
- This is an **original** game. Don't copy art, sounds, layouts or the name from Wheel of Fortune or the "Wheel of Fortune for PowerPoint" template by Games by Tim. That template is CC BY-NC-SA and the show is trademarked. Generic genre mechanics are fine.

## Testing
- Serve the folder (`python3 -m http.server`) and open `index.html`. Use **Open Display** for the second page.
- `index.html?test` runs a few `console.assert` checks on `layout()`.
- Background or hidden browser tabs throttle the Firebase socket, so updates can look stalled. Bring the display tab to the front before deciding sync is broken.
