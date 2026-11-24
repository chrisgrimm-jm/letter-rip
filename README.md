# Letter Rip

A spin-and-solve word puzzle game for live shows. Built in-house at Jomboy Media.

- **Host:** `index.html` has all the controls (puzzles, wheel, scores, rounds).
- **Display:** `display.html?topic=ROOM` is the audience screen for a projector, a TV or an OBS Browser Source (1920×1080). Use the host's **Open Display** button to get the link.

The two pages sync through Firebase Realtime Database, so they can run on different machines.

Rounds: normal, toss-up, speed-up and bonus. Puzzles, players, prizes and wheel wedges are all set in **Setup** and saved in the host's browser.

## Making changes

**Puzzles, names or prizes:** no access needed. Open the host page and use **Setup**. These settings save to that browser only, so to share a puzzle list, copy the text out of the Setup puzzle box and send it.

**The game itself (look, rules, features):**

1. **Get access.** Ask to be added as a collaborator on [chrisgrimm-jm/letter-rip](https://github.com/chrisgrimm-jm/letter-rip) (repo **Settings → Collaborators**), or fork the repo.
2. **Hand it to Claude Code.** Paste this, filling in the change:

   ```text
   Clone https://github.com/chrisgrimm-jm/letter-rip and read its CLAUDE.md. Then [describe the change]. Test it locally with both the host page and the display page, then commit and push to main.
   ```

   `CLAUDE.md` gives Claude how the game works, the design rules and how to test.
3. **It goes live by itself.** Anything pushed to `main` is on the live link in a minute or two. To review changes first, swap the last step for "open a pull request" and approve it on GitHub.
