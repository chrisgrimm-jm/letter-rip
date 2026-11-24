# Letter Rip

A spin-and-solve word puzzle game for live shows. Built in-house at Jomboy Media.

- **Host:** `index.html` has all the controls (puzzles, wheel, scores, rounds).
- **Display:** `display.html?topic=ROOM` is the audience screen for a projector, a TV or an OBS Browser Source (1920×1080). Use the host's **Open Display** button to get the link.

The two pages sync through Firebase Realtime Database, so they can run on different machines.

Rounds: normal, toss-up, speed-up and bonus. Puzzles, players, prizes and wheel wedges are all set in **Setup** and saved in the host's browser.
